const Tesseract = require("tesseract.js");
const fs = require("fs");

async function run() {
    const dir = "C:/Users/efstk/.gemini/antigravity/brain/c7cbcc78-25e2-4159-b6ea-75b2b2a132d6/";
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".png"));

    // Sort files by mtime descendant to get newest
    const sortedFiles = files.map(f => ({ name: f, time: fs.statSync(dir + f).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

    // Run OCR on the top 2 newest images
    for (let i = 0; i < 2; i++) {
        const file = sortedFiles[i].name;
        const fullPath = dir + file;
        console.log("=== Running:", file, "===");
        try {
            const { data: { text } } = await Tesseract.recognize(fullPath, 'jpn');
            console.log(text);
        } catch (e) { }
    }
}
run();
