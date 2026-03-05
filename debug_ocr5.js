const Tesseract = require("tesseract.js");
const fs = require("fs");

async function run() {
    console.log("Starting...");
    const fullPath = "C:/Users/efstk/OneDrive/Desktop/yosankanri/media_recent.png";
    const { data: { text } } = await Tesseract.recognize(fullPath, 'jpn');
    fs.writeFileSync("ocr_recent.txt", text);
    console.log("Saved ocr_recent.txt");
}
run();
