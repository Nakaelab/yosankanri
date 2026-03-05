const fs = require("fs");
const text = fs.readFileSync("purchase_request_raw.txt", "utf8");
const normalized = text.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/，/g, ',');
console.log(normalized.match(/(\d+)\s+([\d,]{3,})\s+([\d,]{3,})/));
