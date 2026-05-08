// ==========================================
// データ型定義（スプレッドシート構造準拠）
// ==========================================

/** 費目カテゴリ（スプレッドシートのフラグに対応） */
export type ExpenseCategory =
    | "goods"        // 物品（フラグなし）
    | "travel"       // 旅費(R)
    | "labor"        // 人件費(L)
    | "other";       // その他(T)

/** 費目カテゴリの日本語ラベル */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    goods: "物品",
    travel: "旅費",
    labor: "人件費",
    other: "その他",
};

/** 費目カテゴリのショートラベル */
export const CATEGORY_SHORT: Record<ExpenseCategory, string> = {
    goods: "物品",
    travel: "旅費",
    labor: "人件費",
    other: "その他",
};

/** 費目カテゴリのカラー */
export const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string; bar: string }> = {
    goods: { bg: "bg-blue-50", text: "text-blue-700", bar: "bg-blue-500" },
    travel: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500" },
    labor: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", bar: "bg-fuchsia-500" },
    other: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500" },
};

/** スプレッドシートのフラグ → カテゴリ変換 */
export const FLAG_TO_CATEGORY: Record<string, ExpenseCategory> = {
    "": "goods",
    "R": "travel",
    "S": "labor",
    "T": "other",
};

/** 全費目カテゴリ一覧 */
export const ALL_CATEGORIES: ExpenseCategory[] = [
    "goods", "travel", "labor", "other",
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
    goods?: number;
    travel?: number;
    labor?: number;
    other?: number;
}

/** 空の配分 */
export function emptyAllocations(): CategoryAllocations {
    return {};
}

/** 予算（研究費/グラント） */
export interface Budget {
    id: string;
    teacherId?: string;     // 所有者の先生ID（オプション: 後方互換性のため）
    name: string;           // 研究費名（例："AMED脳神経チーム代表"）
    jCode: string;          // Jコード（例："J250000252"）
    fiscalYear: number;     // 年度
    allocations: CategoryAllocations; // カテゴリ別配分額
    sortOrder?: number;     // 表示順序（小さいほど上に表示）
    createdAt: string;
}

/** 取引（支出明細） */
export interface Transaction {
    id: string;
    teacherId?: string;     // 所有者の先生ID
    budgetId: string;       // どの予算に紐づくか
    slipNumber: string;     // 伝票番号（例："P250000026-001"）
    orderDate?: string;     // 発注日 (YYYY-MM-DD or empty)
    date: string;           // 納品日 YYYY-MM-DD
    itemName: string;       // 品名
    specification: string;  // 規格等
    payee: string;          // 支払先
    unitPrice: number;      // 単価
    quantity: number;       // 数量
    amount: number;         // 金額
    category: ExpenseCategory; // 費目カテゴリ
    attachmentCount: number;  // 添付ファイル数（見積書等）
    attachments?: AttachmentMeta[]; // 添付ファイルメタデータ
    ocrRawText?: string;    // OCR全文（デバッグ用）
    splitGroupId?: string;  // 複数予算に分割登録した場合のグループID（同じIDの分割分が同一物品）
    status?: "provisional" | "confirmed"; // 仮/確定（主に人件費用）
    memo?: string;          // 備考・メモ
    createdAt: string;
}

/** OCR抽出結果 */
export interface ExtractedData {
    docType: DocType;
    slipNumber: string;
    orderDate?: string;     // 発注日
    date: string;           // 納品日
    itemName: string;
    specification: string;
    payee: string;
    unitPrice: number;
    quantity: number;
    amount: number;
    category: ExpenseCategory;
    memo?: string;
}

/** カテゴリ別集計行 */
export interface CategorySummary {
    category: ExpenseCategory;
    allocated?: number;
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
    storageUrl?: string;  // Supabase Storage の公開URL
    createdAt: string;
}

// ==========================================
// 謝金管理
// ==========================================

/** 月番号 (4〜3 の年度月) */
export type FiscalMonth = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 1 | 2 | 3;

export const FISCAL_MONTHS: FiscalMonth[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

export const MONTH_LABELS: Record<FiscalMonth, string> = {
    4: "4月", 5: "5月", 6: "6月", 7: "7月", 8: "8月", 9: "9月",
    10: "10月", 11: "11月", 12: "12月", 1: "1月", 2: "2月", 3: "3月",
};

/** 月別の時間・時給エントリ */
export interface ShakinMonthEntry {
    month: FiscalMonth;
    hours: number | null;       // 稼働時間
    hourlyRate: number | null;  // 時給（円）
}

/** 謝金対象者 */
export interface ShakinPerson {
    id: string;
    name: string;              // 氏名
    fiscalYear: number;        // 年度
    budgetId?: string;         // 紐づく予算ID（任意）
    months: ShakinMonthEntry[];
    createdAt: string;
    updatedAt: string;
}
