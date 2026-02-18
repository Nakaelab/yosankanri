import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { AttachmentMeta } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const ATTACHMENTS_FILE = path.join(DATA_DIR, "attachments.json");

async function ensureDir() {
    try {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
    } catch (e) {
        // ignore
    }
}

async function readAttachments(): Promise<AttachmentMeta[]> {
    try {
        await ensureDir();
        const data = await fs.readFile(ATTACHMENTS_FILE, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeAttachments(data: AttachmentMeta[]): Promise<void> {
    await ensureDir();
    await fs.writeFile(ATTACHMENTS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const transactionId = formData.get("transactionId") as string;

        if (!file || !transactionId) {
            return NextResponse.json({ error: "Missing file or transactionId" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const id = uuidv4();
        const fileName = file.name;
        const mimeType = file.type;
        const size = file.size;
        const createdAt = new Date().toISOString();

        // Save file
        await ensureDir();
        const filePath = path.join(UPLOADS_DIR, id);
        await fs.writeFile(filePath, buffer);

        // Save metadata
        const meta: AttachmentMeta = {
            id,
            transactionId,
            fileName,
            mimeType,
            size,
            createdAt,
        };

        const list = await readAttachments();
        list.push(meta);
        await writeAttachments(list);

        return NextResponse.json(meta);
    } catch (e) {
        console.error("Upload error:", e);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
