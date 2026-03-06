const pdf = require("pdf-parse");
const fs = require("fs");

const buf = fs.readFileSync("C:/Users/efstk/Downloads/ZKWL101_14441926899_k00000308.pdf");
pdf(buf).then(data => {
    console.log("Pages:", data.numpages);
    console.log("Text preview:", data.text.slice(0, 500));
    fs.writeFileSync("pdf_extracted.txt", data.text);
}).catch(err => {
    console.error("Error:", err.message);
});
