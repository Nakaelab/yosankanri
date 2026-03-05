const fs = require("fs");

function extractPurchaseRequest(text) {
    const normalized = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/，/g, ",");

    const amtLabelMatch = normalized.match(/(?:金額|税込|計|合計)[^\d]*([\d,]{3,})/);
    console.log("amtLabelMatch:", amtLabelMatch);
}

const text = fs.readFileSync("purchase_request_raw.txt", "utf8");
extractPurchaseRequest(text);
