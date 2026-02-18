import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { AttachmentMeta } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const ATTACHMENTS_FILE = path.join(DATA_DIR, "attachments.json");

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        // Find metadata
        let attachments: AttachmentMeta[] = [];
        try {
            const data = await fs.readFile(ATTACHMENTS_FILE, "utf-8");
            attachments = JSON.parse(data);
        } catch {
            return new NextResponse("Metadata not found", { status: 404 });
        }

        const meta = attachments.find((a) => a.id === id);
        if (!meta) {
            return new NextResponse("File not found", { status: 404 });
        }

        // Read file
        const filePath = path.join(UPLOADS_DIR, id);
        try {
            const fileBuffer = await fs.readFile(filePath);

            // Return with correct headers
            return new NextResponse(fileBuffer, {
                headers: {
                    "Content-Type": meta.mimeType,
                    "Content-Disposition": `inline; filename="${encodeURIComponent(meta.fileName)}"`,
                },
            });
        } catch {
            return new NextResponse("File content not found", { status: 404 });
        }

    } catch (e) {
        console.error("Download error:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
