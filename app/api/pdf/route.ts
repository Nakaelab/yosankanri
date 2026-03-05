import { NextResponse } from "next/server";
const pdf = require("pdf-parse");

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const data = await pdf(buffer);

        return NextResponse.json({ text: data.text });
    } catch (e: any) {
        console.error("PDF Parsing Error:", e);
        return NextResponse.json({ error: e.message || "PDFの解析に失敗しました" }, { status: 500 });
    }
}
