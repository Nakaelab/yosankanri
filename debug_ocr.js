const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");

async function run() {
    console.log("Starting...");
    // Read the purchase request image
    const fullPath = "C:/Users/efstk/.gemini/antigravity/brain/c7cbcc78-25e2-4159-b6ea-75b2b2a132d6/media__1772674167262.png";
    const { data: { text } } = await Tesseract.recognize(fullPath, 'jpn');
    fs.writeFileSync("purchase_request_raw.txt", text);
    console.log("Wrote purchase_request_raw.txt");
}
run();
