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

        if (!supabaseUrl || !uploadKey) {
            return NextResponse.json(
                { error: `Supabase key or URL is missing.` },
                { status: 500 }
            );
        }

        // Supabase JS SDK を使用
        const supabase = createClient(supabaseUrl, uploadKey);

        const fileId = uuidv4();
        // 日本語も保持するように（英数字・日本語・記号以外を置換）
        const safeName = file.name.replace(/[^a-zA-Z0-9.\u3000-\u30ff\u4e00-\u9faf_-]/g, "_");
        const storagePath = `${transactionId}/${fileId}_${safeName}`;

        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from("attachments")
            .upload(storagePath, uint8Array, {
                contentType: file.type || "application/octet-stream",
                upsert: true,
            });

        if (uploadError) {
            console.error("Supabase Storage upload error:", uploadError);
            return NextResponse.json(
                { error: `Supabase Error: ${uploadError.message}` },
                { status: 500 }
            );
        }

        const { data: urlData } = supabase.storage
            .from("attachments")
            .getPublicUrl(storagePath);

        const meta: AttachmentMeta = {
            id: fileId,
            transactionId,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            storageUrl: urlData.publicUrl,
            createdAt: new Date().toISOString(),
        };

        return NextResponse.json(meta);
    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ error: `Upload exception: ${String(e)}` }, { status: 500 });
    }
}
