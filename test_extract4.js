const fs = require("fs");

function extractPurchaseRequest(text) {
    const normalized = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/，/g, ",");
    const lines = normalized.split(/[\r\n]+/).map(l => l.trim()).filter(l => l);

    let amount = 0;
    const amtLabelMatch = normalized.match(/(?:金額|税込|計|合計)[^\d]*([\d,]{3,})/);
    if (amtLabelMatch) {
        amount = parseInt(amtLabelMatch[1].replace(/,/g, ""), 10);
        console.log("Setting amount from label:", amount);
    }

    if (!amount || amount > 5000000) {
        const allNums = normalized.match(/[\d,]+/g) || [];
        const cleanNums = allNums.filter(n => !n.startsWith('0') && !n.match(/^2\d{8}$/) && !n.match(/^3\d{5}$/));
        const validNums = cleanNums.map(n => parseInt(n.replace(/,/g, ""), 10)).filter(n => !isNaN(n) && n > 100 && n < 5000000);
        const commaNums = cleanNums.filter(n => n.includes(',')).map(n => parseInt(n.replace(/,/g, ''), 10)).filter(n => n < 5000000);

        if (commaNums.length > 0) {
            amount = Math.max(...commaNums);
            console.log("Setting amount from commas:", amount);
        } else if (validNums.length > 0) {
            amount = Math.max(...validNums);
            console.log("Setting amount from validNums:", amount);
        }
    }

    const lineRowMatch = normalized.match(/(\d+)\s+([\d,]{3,})\s+([\d,]{3,})/);
    if (lineRowMatch) {
        const a = parseInt(lineRowMatch[3].replace(/,/g, ""), 10);
        amount = a;
        console.log("Setting amount from lineRowMatch:", amount);
    }

    for (let i = 0; i < lines.length - 2; i++) {
        if (lines[i].match(/^\d+$/)) {
            const maybeQty = parseInt(lines[i], 10);
            const maybeUp = parseInt(lines[i + 1].replace(/,/g, ""), 10);
            const maybeAmt = parseInt(lines[i + 2].replace(/,/g, ""), 10);

            if (maybeQty > 0 && maybeQty < 1000 && !isNaN(maybeUp) && !isNaN(maybeAmt) && maybeAmt < 5000000) {
                if (maybeQty * maybeUp === maybeAmt || maybeUp === maybeAmt) {
                    amount = maybeAmt;
                    console.log("Setting amount from multi-line:", amount);
                    break;
                }
            }
        }
    }

    console.log("Final Amount:", amount);
}

const text = fs.readFileSync("purchase_request_raw.txt", "utf8");
extractPurchaseRequest(text);
