import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { AttachmentMeta } from "@/lib/types";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const transactionId = formData.get("transactionId") as string;

        if (!file || !transactionId) {
            return NextResponse.json({ error: "Missing file or transactionId" }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        // サービスロールキー（新形式 sb_secret_... / 旧形式 eyJ...）どちらでも対応
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const uploadKey = serviceRoleKey || anonKey;

        const fileId = uuidv4();
        // 日本語等も保持するように
        const safeName = file.name.replace(/[^a-zA-Z0-9.\u3000-\u30ff\u4e00-\u9faf_-]/g, "_");
        const storagePath = `${transactionId}/${fileId}_${safeName}`;

        const arrayBuffer = await file.arrayBuffer();
        const mimeType = file.type || "application/octet-stream";
        let finalUrl = "";

        // 1. Supabaseが設定されていればアップロードを試みる
        if (supabaseUrl && uploadKey) {
            const uint8Array = new Uint8Array(arrayBuffer);
            const supabase = createClient(supabaseUrl, uploadKey);
            
            const { error: uploadError } = await supabase.storage
                .from("attachments")
                .upload(storagePath, uint8Array, {
                    contentType: mimeType,
                    upsert: true,
                });

            if (!uploadError) {
                const { data: urlData } = supabase.storage
                    .from("attachments")
                    .getPublicUrl(storagePath);
                finalUrl = urlData.publicUrl;
            } else {
                console.error("Supabase Storage upload error:", uploadError);
                // エラーの場合はフォールバック(Base64)へ
            }
        }

        // 2. 設定なし・またはエラーだった場合のフォールバック（Base64文字列として直接DB(localStorage)に保持）
        if (!finalUrl) {
            console.log("Fallback to Base64 URI for file:", file.name);
            const buffer = Buffer.from(arrayBuffer);
            const base64Str = buffer.toString("base64");
            finalUrl = `data:${mimeType};base64,${base64Str}`;
        }

        const meta: AttachmentMeta = {
            id: fileId,
            transactionId,
            fileName: file.name,
            mimeType: mimeType,
            size: file.size,
            storageUrl: finalUrl,
            createdAt: new Date().toISOString(),
        };

        return NextResponse.json(meta);
    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ error: `Upload exception: ${String(e)}` }, { status: 500 });
    }
}
