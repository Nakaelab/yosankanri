import("pdfjs-dist/legacy/build/pdf.mjs").then(async (pdfjsLib) => {
    const { getDocument } = pdfjsLib;
    const fs = await import("fs");
    const buf = fs.readFileSync("C:/Users/efstk/Downloads/ZKWL101_14441926899_k00000308.pdf");
    const data = new Uint8Array(buf);
    const pdfDoc = await getDocument({ data }).promise;
    console.log("Pages:", pdfDoc.numPages);
    let fullText = "";
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => ("str" in item ? item.str : "")).join(" ");
        fullText += pageText + "\n";
    }
    console.log("Text length:", fullText.trim().length);
    console.log("Preview:", fullText.slice(0, 500));
    fs.writeFileSync("pdf_text_direct.txt", fullText);
}).catch(err => console.error("Import error:", err.message));
