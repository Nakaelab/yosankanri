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
    const normalized = text
        .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/，/g, ",");
    const lines = normalized.split(/[\r\n]+/).map(l => l.trim()).filter(l => l);

    // ===== 1. 起案NO → 伝票番号 (W2511... or P250... etc.) =====
    let slipNumber = "";
    const kiamNoMatch = normalized.match(/起案\s*N\s*O\s*[:\s]*(W\d{10,})/i)
        || normalized.match(/起案\s*N\s*O\s*[:\s]*([PEW]\d{7,})/i);
    if (kiamNoMatch) {
        slipNumber = kiamNoMatch[1];
    } else {
        slipNumber = extractSlipNumber(text);
    }

    // ===== 2. 起案日 → 発注日 =====
    let orderDate = "";
    // "起案日" のすぐ後の日付パターンを探す
    const kianDateLine = normalized.match(/起案\s*日[^RＲ\d令和]*([RＲ令和]?\s*\d{1,2}\s*[\/／]\s*\d{1,2}\s*[\/／]\s*\d{1,2})/i);
    if (kianDateLine) {
        orderDate = extractDate(kianDateLine[1]);
    } else {
        // ラインをまたぐ場合：「起案」と「日」の行を探す
        for (let i = 0; i < lines.length; i++) {
            if (/起案.*日/.test(lines[i]) || (lines[i].includes("起案") && lines[i + 1]?.includes("日"))) {
                // 同じ行か次の行に日付がある
                const searchText = lines.slice(i, i + 3).join(" ");
                const rMatch = searchText.match(/[RＲ令和]\s*(\d{1,2})\s*[\/／]\s*(\d{1,2})\s*[\/／]\s*(\d{1,2})/);
                if (rMatch) {
                    orderDate = extractDate(rMatch[0]);
                    break;
                }
            }
        }
    }

    // ===== 3. 件名 → 品名 =====
    let itemName = "";
    // "件名" ラベルの後のテキスト
    const kenmeiMatch = normalized.match(/件\s*名\s*[:：]?\s*([^\n\r]{2,50})/);
    if (kenmeiMatch && kenmeiMatch[1].replace(/[\s\d_]/g, "").length > 0) {
        itemName = kenmeiMatch[1].trim();
    } else {
        // ラベルと値が別行の場合
        for (let i = 0; i < lines.length; i++) {
            if (/^件\s*名$/.test(lines[i]) && i + 1 < lines.length) {
                itemName = lines[i + 1].trim();
                break;
            }
        }
    }
    if (!itemName) itemName = "物品";

    // ===== 4. 規格 → 規格等（品名の次行にある英数字コードや説明） =====
    let specification = "";
    // 品名行の次にある規格/型式を探す
    const specMatch = normalized.match(/規\s*格\s*[:：]?\s*([^\n\r]{2,50})/);
    if (specMatch) {
        specification = specMatch[1].trim();
    } else if (itemName && itemName !== "物品") {
        // 品名の次の行をチェック（英数字コードを含む行を優先）
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(itemName)) {
                for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
                    const cand = lines[j];
                    // 英数字混在（型番らしいもの）を優先
                    if (cand.match(/[A-Z]{2,}\d+/) || cand.match(/\d{2,}[A-Z]+/)) {
                        specification = cand;
                        break;
                    }
                    // 数字だけ・ラベル行は除外
                    if (cand.length >= 2 && !cand.match(/^[\d\s,]+$/) &&
                        !cand.match(/^(数量|単価|金額|所管|プロジェ|財源|勘定|科目|納品|消費税)/)) {
                        specification = cand;
                        break;
                    }
                }
                break;
            }
        }
    }

    // ===== 5. 契約相手先 → 支払先 =====
    let payee = "";
    const contractorMatch = normalized.match(/契約相手先\s*[:：]?\s*([^\n\r]{2,40})/);
    if (contractorMatch) {
        payee = contractorMatch[1].replace(/\s*大阪府.*$/, "").trim(); // 住所を削除
        // 括弧内の会社名を取り出す
        const companyMatch = payee.match(/[\(（]?([^\)）\s]{2,20})[\)）]?/);
        if (companyMatch) payee = companyMatch[0].trim();
    } else {
        // 支払先・購入先なども試す
        payee = extractPayee(text);
    }

    // ===== 6. 金額（税込）→ amount =====
    let amount = 0;
    let unitPrice = 0;
    let quantity = 1;

    const MAX_AMOUNT = 5_000_000; // 500万円が上限

    // 「契約金額(税込)」優先
    const contractAmtMatch = normalized.match(/契約金額\s*[\(（]?税込[\)）]?\s*[:\s]?\s*([\d,]+)/);
    if (contractAmtMatch) {
        const v = parseInt(contractAmtMatch[1].replace(/,/g, ""), 10);
        if (v > 0 && v <= MAX_AMOUNT) amount = v;
    }
    // 「金額(税込)」
    if (!amount) {
        const taxIncMatch = normalized.match(/金額\s*[\(（]?税込[\)）]?\s*[:\s]?\s*([\d,]+)/);
        if (taxIncMatch) {
            const v = parseInt(taxIncMatch[1].replace(/,/g, ""), 10);
            if (v > 0 && v <= MAX_AMOUNT) amount = v;
        }
    }
    // 「税込」単独
    if (!amount) {
        const taxMatch = normalized.match(/税込[金額]*\s*[:\s]?\s*([\d,]+)/);
        if (taxMatch) {
            const v = parseInt(taxMatch[1].replace(/,/g, ""), 10);
            if (v > 0 && v <= MAX_AMOUNT) amount = v;
        }
    }

    // 単価・数量の取得（品名テーブル行 数量 単価 金額 が並ぶ行から）
    // [\d,]{3,} は「133,650」や「133650」など3文字以上の数字列
    const tableRowMatch = normalized.match(/(\d+)[,\s]+([\d,]{3,})[,\s]+([\d,]{3,})/);
    if (tableRowMatch) {
        const q = parseInt(tableRowMatch[1], 10);
        const u = parseInt(tableRowMatch[2].replace(/,/g, ""), 10);
        const a = parseInt(tableRowMatch[3].replace(/,/g, ""), 10);
        if (q > 0 && q < 1000 && u > 100 && u <= MAX_AMOUNT && a > 0 && a <= MAX_AMOUNT) {
            if (Math.abs(q * u - a) < a * 0.01 + 1 || u === a) {
                quantity = q;
                unitPrice = u;
                if (!amount) amount = a;
            }
        }
    }
    if (!unitPrice && amount) unitPrice = amount;

    // フォールバック: コンマ区切りの数字のみを候補にする（7桁以上コンマなしは除外）
    if (!amount) {
        const allNums = normalized.match(/[\d,]+/g) || [];
        const commaNums = allNums
            .filter(n => n.includes(","))
            .map(n => parseInt(n.replace(/,/g, ""), 10))
            .filter(n => !isNaN(n) && n > 100 && n <= MAX_AMOUNT);
        if (commaNums.length > 0) amount = Math.max(...commaNums);
        if (!unitPrice && amount) unitPrice = amount;
    }

    // 最終安全確認（万が一pass-throughした場合をリセット）
    if (amount > MAX_AMOUNT) amount = 0;
    if (unitPrice > MAX_AMOUNT) unitPrice = 0;

    // ===== 7. Jコード → メモ =====
    const jCodeMatch = normalized.match(/J(\d{9})/);
    const memo = jCodeMatch ? `J番号: J${jCodeMatch[1]}` : "";

    return {
        docType: "purchase_request",
        slipNumber,
        orderDate: orderDate || undefined,
        date: "",
        itemName,
        specification,
        payee,
        unitPrice,
        quantity,
        amount,
        category: "goods",
        memo,
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

// ==========================================
// コピペテキスト（マークダウン表・KV形式）からの抽出
// ==========================================

/**
 * ChatGPT等が出力するマークダウン表やキーバリュー形式テキストを解析してフォームに反映
 * 対応形式:
 *   | 項目 | 値 |     ← マークダウン表
 *   項目: 値          ← キーバリュー
 *   項目　値          ← タブ/全角スペース区切り
 */
export function extractFromPastedText(raw: string): Partial<ExtractedData> {
    // キーと値のペアを収集
    const pairs: Record<string, string> = {};

    // マークダウン表形式 | key | value | を解析
    const tableRows = raw.split(/\r?\n/).filter(l => l.trim().startsWith("|"));
    for (const row of tableRows) {
        const cells = row.split("|").map(c => c.trim()).filter(c => c && c !== "---" && !c.match(/^-+$/));
        if (cells.length >= 2) {
            pairs[cells[0]] = cells[1];
        }
    }

    // キーバリュー形式 "key: value" or "key　value" を解析（表でない行）
    if (Object.keys(pairs).length === 0) {
        for (const line of raw.split(/\r?\n/)) {
            const kv = line.match(/^([^\t:：　|]+)[:\s:：　]\s*(.+)$/);
            if (kv) {
                pairs[kv[1].trim()] = kv[2].trim();
            }
        }
    }

    // キー名を正規化して値を取り出すヘルパー
    const get = (...keys: string[]): string => {
        for (const key of keys) {
            for (const [k, v] of Object.entries(pairs)) {
                const kn = k.replace(/\s/g, "");
                const kn2 = key.replace(/\s/g, "");
                if (kn === kn2 || kn.includes(kn2) || kn2.includes(kn)) {
                    return v;
                }
            }
        }
        return "";
    };

    // 日付の正規化ヘルパー
    const toDate = (s: string): string => {
        if (!s) return "";
        // R7/2/2 → extractDate で処理
        return extractDate(s) || s;
    };

    // 金額の正規化ヘルパー（「133,650円」→ 133650）
    const toAmount = (s: string): number => {
        if (!s) return 0;
        const n = parseInt(s.replace(/[円¥,，\s]/g, "").replace(/[０-９]/g, c =>
            String.fromCharCode(c.charCodeAt(0) - 0xfee0)
        ), 10);
        return isNaN(n) ? 0 : n;
    };

    const qty = parseInt(get("数量", "個数", "quantity") || "1", 10) || 1;
    const unitPriceStr = get("単価", "価格", "unit price", "単価（税込）");
    const amountStr = get("金額", "合計", "税込金額", "契約金額", "amount", "合計金額", "税込", "総額");
    const unitPrice = toAmount(unitPriceStr);
    let amount = toAmount(amountStr);
    if (!amount && unitPrice) amount = unitPrice * qty;

    const orderDateStr = get("起案日", "発注日", "注文日", "起案日付", "order date", "注文日付");
    const memoStr = get("J番号", "Jコード", "J code", "コード", "備考", "メモ", "memo", "note");
    const slipStr = get("伝票番号", "起案NO", "起案No", "起案番号", "slip", "伝票No");

    return {
        slipNumber: slipStr || "",
        orderDate: toDate(orderDateStr) || undefined,
        itemName: get("品名", "件名", "商品名", "品目", "item", "item name") || "",
        specification: get("規格", "型番", "型式", "規格等", "spec", "specification") || "",
        payee: get("支払先", "契約相手先", "納入業者", "購入先", "業者", "payee", "vendor") || "",
        unitPrice,
        quantity: qty,
        amount,
        memo: memoStr || "",
        category: "goods",
        docType: "purchase_request",
        date: "",
    };
}
