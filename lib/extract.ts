import { DocType, ExtractedData, ExpenseCategory } from "./types";

// ==========================================
// OCR テキストからの情報抽出ロジック
// ==========================================

/**
 * 書類種別を判定
 */
function detectDocType(text: string): DocType {
    if (text.includes("購入依頼")) return "purchase_request";
    if (text.includes("立替払請求書") || text.includes("立替払")) return "reimbursement";
    if (text.includes("旅費計算書") || text.includes("旅費精算") || text.includes("旅行命令")) return "travel";
    return "reimbursement";
}

/**
 * 費目カテゴリを推定
 */
function detectCategory(text: string, docType: DocType): ExpenseCategory {
    if (docType === "travel") return "travel";
    if (text.includes("謝金") || text.includes("謝礼")) return "labor";
    if (text.includes("再委託") || text.includes("委託")) return "subcontract";
    if (text.includes("返金") || text.includes("返納")) return "refund";
    // 購入依頼は大体「物品」
    if (docType === "purchase_request") return "goods";
    return "goods";
}

/**
 * 伝票番号の抽出
 */
function extractSlipNumber(text: string): string {
    const normalized = text.replace(/[０-９]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    );
    // P250..., E250..., W250... パターン
    const match = normalized.match(/[PEWF]\d{7,}[-‐]\d{2,3}/);
    if (match) return match[0];
    // ハイフンなし
    const match2 = normalized.match(/[PEWF]\d{10,}/);
    if (match2) return match2[0];
    return "";
}

/**
 * Jコード抽出
 */
function extractJCode(text: string): string {
    const normalized = text.replace(/[０-９]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    );
    const match = normalized.match(/J\d{9}/);
    return match ? match[0] : "";
}

/**
 * 金額抽出
 */
function extractAmount(text: string, docType: DocType): number {
    const normalized = text
        .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/，/g, ",");

    if (docType === "reimbursement") {
        const kinMatch = normalized.match(/金\s*([\d,]+)\s*円/);
        if (kinMatch) return parseInt(kinMatch[1].replace(/,/g, ""), 10);
    }

    if (docType === "purchase_request") {
        const taxMatch = normalized.match(/税込[金額額]*\s*[:\s]?\s*([\d,]+)/);
        if (taxMatch) return parseInt(taxMatch[1].replace(/,/g, ""), 10);
        const totalMatch = normalized.match(/合計[金額額]*\s*[:\s]?\s*([\d,]+)/);
        if (totalMatch) return parseInt(totalMatch[1].replace(/,/g, ""), 10);
    }

    if (docType === "travel") {
        const seisanMatch = normalized.match(/精算[額]*\s*[:\s]?\s*([\d,]+)/);
        if (seisanMatch) return parseInt(seisanMatch[1].replace(/,/g, ""), 10);
    }

    // fallback
    const allNumbers = normalized.match(/[\d,]{3,}/g);
    if (allNumbers) {
        const amounts = allNumbers
            .map((n) => parseInt(n.replace(/,/g, ""), 10))
            .filter((n) => !isNaN(n) && n > 0);
        if (amounts.length > 0) return Math.max(...amounts);
    }
    return 0;
}

/**
 * 日付抽出
 */
export function extractDate(text: string): string {
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

/**
 * 品名抽出
 */
function extractItemName(text: string, docType: DocType): string {
    if (docType === "purchase_request") {
        const hinMatch = text.match(/品名\s*[:\s]*([^\n\r]{2,50})/);
        if (hinMatch) return hinMatch[1].trim();
        const hmkMatch = text.match(/品目\s*[:\s]*([^\n\r]{2,50})/);
        if (hmkMatch) return hmkMatch[1].trim();
    }
    if (docType === "reimbursement") {
        const tadashiMatch = text.match(/但し[、,]?\s*(.+?)\s*代?\s*として/);
        if (tadashiMatch) return tadashiMatch[1].trim() + "代";
        const youtoMatch = text.match(/用途\s*[:\s]*([^\n\r]{2,50})/);
        if (youtoMatch) return youtoMatch[1].trim();
    }
    if (docType === "travel") {
        return "旅費（精算）";
    }
    return "";
}

/**
 * 支払先抽出
 */
function extractPayee(text: string): string {
    const match = text.match(/支払先\s*[:\s]*([^\n\r]{2,30})/);
    if (match) return match[1].trim();
    const match2 = text.match(/購入先\s*[:\s]*([^\n\r]{2,30})/);
    if (match2) return match2[1].trim();
    const match3 = text.match(/業者[名]?\s*[:\s]*([^\n\r]{2,30})/);
    if (match3) return match3[1].trim();
    return "";
}

/**
 * 購入依頼書専用の抽出ロジック
 */
function extractPurchaseRequest(text: string): ExtractedData {
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
        slipNumber: extractSlipNumber(text),
        orderDate: orderDate || undefined,
        date: "",
        itemName: itemName,
        specification: specification,
        payee: extractPayee(text),
        unitPrice: unitPrice,
        quantity: quantity,
        amount: amount,
        category: "goods",
        memo: memo
    };
}

/**
 * OCRテキストから情報を抽出するメイン関数
 */
export function extractFromOCRText(ocrText: string): ExtractedData {
    const docType = detectDocType(ocrText);

    if (docType === "purchase_request") {
        return extractPurchaseRequest(ocrText);
    }

    const amount = extractAmount(ocrText, docType);

    return {
        docType,
        slipNumber: extractSlipNumber(ocrText),
        date: extractDate(ocrText),
        itemName: extractItemName(ocrText, docType),
        specification: "",
        payee: extractPayee(ocrText),
        unitPrice: amount,
        quantity: 1,
        amount,
        category: detectCategory(ocrText, docType),
    };
}
