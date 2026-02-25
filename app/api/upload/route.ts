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
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
        }

        const id = uuidv4();
        const ext = file.name.split(".").pop() || "bin";
        const storagePath = `${transactionId}/${id}.${ext}`;

        // Supabase Storage へアップロード
        const arrayBuffer = await file.arrayBuffer();
        const uploadRes = await fetch(
            `${supabaseUrl}/storage/v1/object/attachments/${storagePath}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${supabaseKey}`,
                    "Content-Type": file.type || "application/octet-stream",
                    "x-upsert": "true",
                },
                body: arrayBuffer,
            }
        );

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            console.error("Supabase Storage upload error:", errText);
            return NextResponse.json({ error: "Storage upload failed" }, { status: 500 });
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/attachments/${storagePath}`;

        const meta: AttachmentMeta = {
            id,
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
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
