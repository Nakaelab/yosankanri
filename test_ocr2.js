const Tesseract = require("tesseract.js");
const fs = require("fs");

async function run() {
    const dir = "C:/Users/efstk/.gemini/antigravity/brain/c7cbcc78-25e2-4159-b6ea-75b2b2a132d6/";
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".png"));

    for (const file of files) {
        const fullPath = dir + file;
        console.log("=== Running:", file, "===");
        try {
            const { data: { text } } = await Tesseract.recognize(fullPath, 'jpn');
            if (text.includes("依頼") || text.includes("起案") || text.includes("魚眼")) {
                console.log("FOUND RELEVANT DOC in", file);
                console.log(text);
                fs.writeFileSync("found_ocr.txt", text);
                break;
            }
        } catch (e) { }
    }
}
run();
