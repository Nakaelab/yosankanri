const Tesseract = require("tesseract.js");
const fs = require("fs");

async function run() {
    const images = [
        "C:/Users/efstk/.gemini/antigravity/brain/c7cbcc78-25e2-4159-b6ea-75b2b2a132d6/media__1772673726240.png",
        "C:/Users/efstk/.gemini/antigravity/brain/c7cbcc78-25e2-4159-b6ea-75b2b2a132d6/media__1772674167262.png"
    ];

    for (const file of images) {
        if (!fs.existsSync(file)) continue;
        console.log("=== Running:", file, "===");
        const { data: { text } } = await Tesseract.recognize(file, 'jpn');
        console.log(text);
        if (text.includes("購入依頼")) {
            console.log("\n====== FOUND PURCHASE REQUEST ======\n");
        }
    }
}
run();
