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
    if (text.includes("謝金") || text.includes("謝礼")) return "honorarium";
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
function extractDate(text: string): string {
    const normalized = text.replace(/[０-９]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    );

    const reiwaPat = /令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
    const reiwaMatch = normalized.match(reiwaPat);
    if (reiwaMatch) {
        const year = 2018 + parseInt(reiwaMatch[1], 10);
        return `${year}-${reiwaMatch[2].padStart(2, "0")}-${reiwaMatch[3].padStart(2, "0")}`;
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
 * OCRテキストから情報を抽出するメイン関数
 */
export function extractFromOCRText(ocrText: string): ExtractedData {
    const docType = detectDocType(ocrText);
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
