const fs = require("fs");

function extractPurchaseRequest(text) {
    const normalized = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/，/g, ",");
    const allNums = normalized.match(/[\d,]+/g) || [];
    const cleanNums = allNums.filter(n => !n.startsWith('0') && !n.match(/^2\d{8}$/) && !n.match(/^3\d{5}$/));
    const validNums = cleanNums.map(n => parseInt(n.replace(/,/g, ""), 10)).filter(n => !isNaN(n) && n > 100 && n < 5000000);
    console.log("allNums:", allNums);
    console.log("cleanNums:", cleanNums);
    console.log("validNums:", validNums);
}

const text = fs.readFileSync("purchase_request_raw.txt", "utf8");
extractPurchaseRequest(text);
