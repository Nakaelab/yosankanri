const Tesseract = require("tesseract.js");
const fs = require("fs");

async function run() {
    console.log("Starting...");
    const fullPath = "C:/Users/efstk/.gemini/antigravity/brain/c7cbcc78-25e2-4159-b6ea-75b2b2a132d6/media__1772674167262.png"; // Original purchase request
    const { data: { text } } = await Tesseract.recognize(fullPath, 'jpn');
    console.log(text);
    fs.writeFileSync("ocr_full.txt", text);
}
run();
