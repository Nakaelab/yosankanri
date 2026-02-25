import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
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
        // サーバー側はサービスロールキーを使用（RLSを問わずアップロード可能）
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const uploadKey = serviceRoleKey || anonKey;

        if (!supabaseUrl || !uploadKey) {
            return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
        }

        const fileId = uuidv4();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${transactionId}/${fileId}_${safeName}`;

        // Supabase Storage REST API でアップロード
        const arrayBuffer = await file.arrayBuffer();
        const uploadUrl = `${supabaseUrl}/storage/v1/object/attachments/${storagePath}`;

        const uploadRes = await fetch(uploadUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${uploadKey}`,
                "Content-Type": file.type || "application/octet-stream",
                "x-upsert": "true",
            },
            body: arrayBuffer,
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            console.error("Supabase Storage upload error:", uploadRes.status, errText);
            return NextResponse.json(
                { error: `Storage upload failed: ${uploadRes.status} ${errText}` },
                { status: 500 }
            );
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/attachments/${storagePath}`;

        const meta: AttachmentMeta = {
            id: fileId,
            transactionId,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            storageUrl: publicUrl,
            createdAt: new Date().toISOString(),
        };

        return NextResponse.json(meta);
    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ error: `Upload failed: ${String(e)}` }, { status: 500 });
    }
}
