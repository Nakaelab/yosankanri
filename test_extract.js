const fs = require("fs");

function extractDate(text) {
    const normalized = text.replace(/[０-９]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    );

    const reiwaPat = /令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
    const reiwaMatch = normalized.match(reiwaPat);
    if (reiwaMatch) {
        const year = 2018 + parseInt(reiwaMatch[1], 10);
        return `${year}-${reiwaMatch[2].padStart(2, "0")}-${reiwaMatch[3].padStart(2, "0")}`;
    }

    const rPat = /[RＲ]\s*(\d{1,2})\s*[\/／]\s*(\d{1,2})\s*[\/／]\s*(\d{1,2})/;
    const rMatch = normalized.match(rPat);
    if (rMatch) {
        const year = 2018 + parseInt(rMatch[1], 10);
        return `${year}-${rMatch[2].padStart(2, "0")}-${rMatch[3].padStart(2, "0")}`;
    }

    const heiseiPat = /平成\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
    const heiseiMatch = normalized.match(heiseiPat);
    if (heiseiMatch) {
        const year = 1988 + parseInt(heiseiMatch[1], 10);
        return `${year}-${heiseiMatch[2].padStart(2, "0")}-${heiseiMatch[3].padStart(2, "0")}`;
    }

    const isoMatch = normalized.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
    }

    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}


function extractPurchaseRequest(text) {
    const normalized = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/，/g, ",");
    const lines = normalized.split(/[\r\n]+/).map(l => l.trim()).filter(l => l);

    // 1. 起案日 (発注日)
    let orderDate = "";
    const kianDateMatch = normalized.match(/(?:起案日?|起案)[^\dRＲ]*([RＲ令和]?\s*\d{1,2}\s*[\/／]\s*\d{1,2}\s*[\/／]\s*\d{1,2})/i);
    if (kianDateMatch) {
        orderDate = extractDate(kianDateMatch[1]);
    } else {
        const rPat = /[RＲ令和]\s*(\d{1,2})\s*[\/／]\s*(\d{1,2})\s*[\/／]\s*(\d{1,2})/;
        const rMatch = normalized.match(rPat);
        if (rMatch) {
            orderDate = extractDate(rMatch[0]);
        }
    }

    // 2. 件名(品名)と規格
    let itemName = "";
    let specification = "";
    const kenmeiMatch = normalized.match(/件\s*名\s*[:：]?\s*([^\n\r]+)/);
    if (kenmeiMatch && kenmeiMatch[1].replace(/[\s\d_]/g, "").length > 0) {
        itemName = kenmeiMatch[1].trim();
    } else {
        const kenmeiIdx = lines.findIndex(l => l.includes("件") && l.includes("名"));
        if (kenmeiIdx >= 0 && kenmeiIdx + 1 < lines.length) {
            itemName = lines[kenmeiIdx + 1].replace(/^[:：]\s*/, "").trim();
        }
    }

    if (itemName) {
        const safeItemName = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const itemLineIdx = lines.findIndex(l => l.match(new RegExp(`^${safeItemName}$`)) || l.includes(itemName));
        if (itemLineIdx >= 0) {
            for (let i = 1; i <= 3; i++) {
                if (itemLineIdx + i >= lines.length) break;
                const cand = lines[itemLineIdx + i];
                // 確実に数字や関係ないワードを避ける
                if (!cand.match(/^[\d,\.\s]+$/) && !cand.match(/^(数量|単価|金額|所\s*管|プロジェ|財\s*源|勘定|科目)/) && cand.length >= 2) {
                    specification = cand;
                    break;
                }
            }
        }
    }

    if (!itemName) {
        itemName = "物品";
    }

    // 3. 金額・単価・数量
    let amount = 0;
    let unitPrice = 0;
    let quantity = 1;

    // 「金額」「税込」「計」などのお金を示すキーワードの近くにある数字を探すのが最も確実
    const amtLabelMatch = normalized.match(/(?:金額|税込|計|合計)[^\d]*([\d,]{3,})/);
    if (amtLabelMatch) {
        amount = parseInt(amtLabelMatch[1].replace(/,/g, ""), 10);
    }

    // 見つからなければ全体から推理 (カンマ付きの数字を最優先、大きすぎるコード番号などを除外)
    if (!amount || amount > 5000000) {
        const allNums = normalized.match(/[\d,]+/g) || [];
        const validNums = allNums.map(n => parseInt(n.replace(/,/g, ""), 10)).filter(n => !isNaN(n) && n > 100 && n < 5000000);
        const commaNums = allNums.filter(n => n.includes(',')).map(n => parseInt(n.replace(/,/g, ''), 10)).filter(n => n < 5000000);

        if (commaNums.length > 0) {
            amount = Math.max(...commaNums);
        } else if (validNums.length > 0) {
            amount = Math.max(...validNums);
        }
    }
    unitPrice = amount;

    // 同じ行に「数量・単価・金額」が連続しているかもしれない
    for (let i = 0; i < lines.length - 2; i++) {
        if (lines[i].match(/^\d+$/)) {
            const maybeQty = parseInt(lines[i], 10);
            const maybeUp = parseInt(lines[i + 1].replace(/,/g, ""), 10);
            const maybeAmt = parseInt(lines[i + 2].replace(/,/g, ""), 10);

            if (maybeQty > 0 && maybeQty < 1000 && !isNaN(maybeUp) && !isNaN(maybeAmt) && maybeAmt < 5000000) {
                if (maybeQty * maybeUp === maybeAmt || maybeUp === maybeAmt) {
                    quantity = maybeQty;
                    unitPrice = maybeUp;
                    amount = maybeAmt;
                    break;
                }
            }
        }
    }

    // スペース区切りの連続した数値を探す
    const lineRowMatch = normalized.match(/(\d+)\s+([\d,]{3,})\s+([\d,]{3,})/);
    if (lineRowMatch) {
        const q = parseInt(lineRowMatch[1], 10);
        const u = parseInt(lineRowMatch[2].replace(/,/g, ""), 10);
        const a = parseInt(lineRowMatch[3].replace(/,/g, ""), 10);
        if (q > 0 && q < 1000 && u > 100 && u < 5000000) {
            if (q * u === a || u === a) {
                quantity = q;
                unitPrice = u;
                amount = a;
            }
        }
    }

    // 4. Jナンバーを確実にメモへ
    const jCodeMatch = normalized.match(/[JＪ]?[A-Za-z]?\s*(2\d{8})/);
    const memo = jCodeMatch ? `J番号: J${jCodeMatch[1]}` : "";

    return {
        docType: "purchase_request",
        orderDate: orderDate || undefined,
        date: "",
        itemName: itemName,
        specification: specification,
        unitPrice: unitPrice,
        quantity: quantity,
        amount: amount,
        category: "goods",
        memo: memo
    };
}

const text = fs.readFileSync("purchase_request_raw.txt", "utf8");
console.log(extractPurchaseRequest(text));
