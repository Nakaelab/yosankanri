// ==========================================
// データ型定義（スプレッドシート構造準拠）
// ==========================================

/** 費目カテゴリ（スプレッドシートのフラグに対応） */
export type ExpenseCategory =
    | "goods"        // 物品（フラグなし）
    | "travel"       // 旅費(R)
    | "honorarium"   // 謝金(S)
    | "labor"        // 人件費(L)
    | "other"        // その他(T)
    | "subcontract"  // 再委託(I)
    | "refund";      // 返金(H)

/** 費目カテゴリの日本語ラベル */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    goods: "物品",
    travel: "旅費(R)",
    honorarium: "謝金",
    labor: "人件費(S)",
    other: "その他(T)",
    subcontract: "再委託(I)",
    refund: "返金(H)",
};

/** 費目カテゴリのショートラベル */
export const CATEGORY_SHORT: Record<ExpenseCategory, string> = {
    goods: "物品",
    travel: "旅費",
    honorarium: "謝金",
    labor: "人件費",
    other: "その他",
    subcontract: "再委託",
    refund: "返金",
};

/** 費目カテゴリのカラー */
export const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string; bar: string }> = {
    goods: { bg: "bg-blue-50", text: "text-blue-700", bar: "bg-blue-500" },
    travel: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500" },
    honorarium: { bg: "bg-purple-50", text: "text-purple-700", bar: "bg-purple-500" },
    labor: { bg: "bg-indigo-50", text: "text-indigo-700", bar: "bg-indigo-500" },
    other: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500" },
    subcontract: { bg: "bg-rose-50", text: "text-rose-700", bar: "bg-rose-500" },
    refund: { bg: "bg-gray-50", text: "text-gray-600", bar: "bg-gray-400" },
};

/** スプレッドシートのフラグ → カテゴリ変換 */
export const FLAG_TO_CATEGORY: Record<string, ExpenseCategory> = {
    "": "goods",
    "R": "travel",
    "S": "labor",
    "T": "other",
    "I": "subcontract",
    "H": "refund",
};

/** 全費目カテゴリ一覧 */
export const ALL_CATEGORIES: ExpenseCategory[] = [
    "goods", "travel", "honorarium", "labor", "other", "subcontract", "refund",
];

/** 書類種別（OCR判定用） */
export type DocType = "purchase_request" | "reimbursement" | "travel";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
    purchase_request: "購入依頼",
    reimbursement: "立替払",
    travel: "旅費",
};

/** カテゴリごとの配分額 */
export interface CategoryAllocations {
    goods: number;
    travel: number;
    honorarium: number;
    labor: number;
    other: number;
    subcontract: number;
    refund: number;
}

/** 空の配分 */
export function emptyAllocations(): CategoryAllocations {
    return { goods: 0, travel: 0, honorarium: 0, labor: 0, other: 0, subcontract: 0, refund: 0 };
}

/** 予算（研究費/グラント） */
export interface Budget {
    id: string;
    teacherId?: string;     // 所有者の先生ID（オプション: 後方互換性のため）
    name: string;           // 研究費名（例："AMED脳神経チーム代表"）
    jCode: string;          // Jコード（例："J250000252"）
    fiscalYear: number;     // 年度
    allocations: CategoryAllocations; // カテゴリ別配分額
    createdAt: string;
}

/** 取引（支出明細） */
export interface Transaction {
    id: string;
    teacherId?: string;     // 所有者の先生ID
    budgetId: string;       // どの予算に紐づくか
    slipNumber: string;     // 伝票番号（例："P250000026-001"）
    date: string;           // 納品日 YYYY-MM-DD
    itemName: string;       // 品名
    specification: string;  // 規格等
    payee: string;          // 支払先
    unitPrice: number;      // 単価
    quantity: number;       // 数量
    amount: number;         // 金額
    category: ExpenseCategory; // 費目カテゴリ
    attachmentCount: number;  // 添付ファイル数（見積書等）
    ocrRawText?: string;    // OCR全文（デバッグ用）
    createdAt: string;
}

/** OCR抽出結果 */
export interface ExtractedData {
    docType: DocType;
    slipNumber: string;
    date: string;
    itemName: string;
    specification: string;
    payee: string;
    unitPrice: number;
    quantity: number;
    amount: number;
    category: ExpenseCategory;
}

/** カテゴリ別集計行 */
export interface CategorySummary {
    category: ExpenseCategory;
    allocated: number;
    spent: number;
    remaining: number;
}

/** 予算サマリー */
export interface BudgetSummary {
    budget: Budget;
    categories: CategorySummary[];
    totalAllocated: number;
    totalSpent: number;
    totalRemaining: number;
}

/** バリデーション結果 */
export interface ValidationResult {
    field: string;
    message: string;
}

export function validateExtracted(data: ExtractedData): ValidationResult[] {
    const errors: ValidationResult[] = [];
    if (!data.itemName.trim()) {
        errors.push({ field: "itemName", message: "品名が空です" });
    }
    if (data.amount <= 0) {
        errors.push({ field: "amount", message: "金額が0以下です" });
    }
    if (!data.date) {
        errors.push({ field: "date", message: "日付が空です" });
    }
    return errors;
}

/** 先生（ユーザープロファイル） */
export interface Teacher {
    id: string;
    name: string;
    createdAt: string;
}

/** 添付ファイルメタデータ */
export interface AttachmentMeta {
    id: string;
    transactionId: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: string;
}
