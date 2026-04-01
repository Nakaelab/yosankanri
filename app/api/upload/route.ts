import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { AttachmentMeta } from "@/lib/types";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const transactionId = formData.get("transactionId") as string;

        if (!file || !transactionId) {
            return NextResponse.json({ error: "Missing file or transactionId" }, { status: 400 });
        }

        const fileId = uuidv4();
        const safeName = file.name.replace(/[^a-zA-Z0-9.\u3000-\u30ff\u4e00-\u9faf_-]/g, "_");
        
        // ローカル（public/attachments）に保存
        const uploadDir = path.join(process.cwd(), "public", "attachments", transactionId);
        
        // ディレクトリが存在しない場合は作成
        await mkdir(uploadDir, { recursive: true });
        
        const fileName = `${fileId}_${safeName}`;
        const filePath = path.join(uploadDir, fileName);
        
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // ファイルを保存
        await writeFile(filePath, buffer);

        // 公開用URLを構築
        const storageUrl = `/attachments/${transactionId}/${encodeURIComponent(fileName)}`;

        const meta: AttachmentMeta = {
            id: fileId,
            transactionId,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            storageUrl, // ローカルURLを返す
            createdAt: new Date().toISOString(),
        };

        return NextResponse.json(meta);
    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ error: `Upload failed: ${String(e)}` }, { status: 500 });
    }
}
