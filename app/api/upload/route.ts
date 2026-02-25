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
                { error: `Supabase not configured (url=${!!supabaseUrl}, key=${!!uploadKey})` },
                { status: 500 }
            );
        }

        // Supabase JS SDK を使用（新旧キー形式に両対応）
        const supabase = createClient(supabaseUrl, uploadKey);

        const fileId = uuidv4();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
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
                { error: `Storage upload failed: ${uploadError.message}` },
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
            mimeType: file.type,
            size: file.size,
            storageUrl: urlData.publicUrl,
            createdAt: new Date().toISOString(),
        };

        return NextResponse.json(meta);
    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ error: `Upload failed: ${String(e)}` }, { status: 500 });
    }
}
