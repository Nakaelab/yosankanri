const fs = require("fs");

function extractPurchaseRequest(text) {
    const normalized = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/，/g, ",");
    const lines = normalized.split(/[\r\n]+/).map(l => l.trim()).filter(l => l);
    for (let i = 0; i < lines.length - 2; i++) {
        if (lines[i].match(/^\d+$/)) {
            const maybeQty = parseInt(lines[i], 10);
            const maybeUp = parseInt(lines[i + 1].replace(/,/g, ""), 10);
            const maybeAmt = parseInt(lines[i + 2].replace(/,/g, ""), 10);
            console.log(`Checking line ${i}: maybeQty=${maybeQty}, maybeUp=${maybeUp}, maybeAmt=${maybeAmt}`);
        }
    }
}

const text = fs.readFileSync("purchase_request_raw.txt", "utf8");
extractPurchaseRequest(text);
