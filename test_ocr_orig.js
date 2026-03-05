const Tesseract = require("tesseract.js");
const fs = require("fs");

async function run() {
    const fullPath = "C:/Users/efstk/.gemini/antigravity/brain/c7cbcc78-25e2-4159-b6ea-75b2b2a132d6/media__1772669123928.png";
    const { data: { text } } = await Tesseract.recognize(fullPath, 'jpn');
    console.log("Saving full output...");
    fs.writeFileSync("ocr_raw_123928.txt", text);
}
run();
