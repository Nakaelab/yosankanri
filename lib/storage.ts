import {
    Transaction, Budget, BudgetSummary, CategorySummary,
    ALL_CATEGORIES, ExpenseCategory, CategoryAllocations,
    Teacher,
} from "./types";
import { pushToCloud, deleteFromCloud } from "./cloud-sync";

// ==========================================
// LocalStorage + Cloud Sync データ永続化
// ==========================================

const TRANSACTIONS_KEY = "budget_app_transactions_v2";
const BUDGETS_KEY = "budget_app_budgets_v2";
const TEACHERS_KEY = "budget_app_teachers";
const CURRENT_TEACHER_KEY = "budget_app_current_teacher";

// ヘルパー: localStorage に書き込み + クラウドへ非同期プッシュ
function setAndSync(key: string, value: string): void {
    localStorage.setItem(key, value);
    pushToCloud(key, value);
}

// ---------- Teachers ----------

export function getTeachers(): Teacher[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(TEACHERS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveTeacher(teacher: Teacher): void {
    const list = getTeachers();
    list.push(teacher);
    setAndSync(TEACHERS_KEY, JSON.stringify(list));
}

export function deleteTeacher(id: string): void {
    const list = getTeachers().filter((t) => t.id !== id);
    setAndSync(TEACHERS_KEY, JSON.stringify(list));
    // 関連データの削除も行う
    const txKey = `${TRANSACTIONS_KEY}_${id}`;
    const bgKey = `${BUDGETS_KEY}_${id}`;
    localStorage.removeItem(txKey);
    localStorage.removeItem(bgKey);
    deleteFromCloud(txKey);
    deleteFromCloud(bgKey);
}

export function getCurrentTeacherId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(CURRENT_TEACHER_KEY);
}

export function setCurrentTeacherId(id: string | null): void {
    if (id) {
        setAndSync(CURRENT_TEACHER_KEY, id);
    } else {
        localStorage.removeItem(CURRENT_TEACHER_KEY);
        deleteFromCloud(CURRENT_TEACHER_KEY);
    }
}

export function getTeacherById(id: string): Teacher | undefined {
    return getTeachers().find((t) => t.id === id);
}

export function getCurrentTeacher(): Teacher | undefined {
    const id = getCurrentTeacherId();
    return id ? getTeacherById(id) : undefined;
}

// キー生成ロジック
function getStorageKey(baseKey: string): string {
    const current = getCurrentTeacherId();
    // デフォルトユーザー（未設定含む）の場合は元のキーを使用
    if (!current || current === "default") return baseKey;
    return `${baseKey}_${current}`;
}

// ---------- Transactions ----------

export function getTransactions(): Transaction[] {
    if (typeof window === "undefined") return [];
    try {
        const key = getStorageKey(TRANSACTIONS_KEY);
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveTransaction(tx: Transaction): void {
    const list = getTransactions();
    const index = list.findIndex((t) => t.id === tx.id);
    if (index >= 0) {
        list[index] = tx;
    } else {
        list.push(tx);
    }
    const key = getStorageKey(TRANSACTIONS_KEY);
    setAndSync(key, JSON.stringify(list));
}

export function deleteTransaction(id: string): void {
    const list = getTransactions().filter((t) => t.id !== id);
    const key = getStorageKey(TRANSACTIONS_KEY);
    setAndSync(key, JSON.stringify(list));
}

export function getTransactionsByBudget(budgetId: string): Transaction[] {
    return getTransactions()
        .filter((t) => t.budgetId === budgetId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ---------- Budgets ----------

export function getBudgets(): Budget[] {
    if (typeof window === "undefined") return [];
    try {
        const key = getStorageKey(BUDGETS_KEY);
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveBudget(budget: Budget): void {
    const list = getBudgets();
    const index = list.findIndex((b) => b.id === budget.id);
    if (index >= 0) {
        list[index] = budget;
    } else {
        list.push(budget);
    }
    const key = getStorageKey(BUDGETS_KEY);
    setAndSync(key, JSON.stringify(list));
}

export function updateBudget(budget: Budget): void {
    saveBudget(budget); // updateBudget is now an alias for saveBudget
}

export function deleteBudget(id: string): void {
    const list = getBudgets().filter((b) => b.id !== id);
    const key = getStorageKey(BUDGETS_KEY);
    setAndSync(key, JSON.stringify(list));
}

export function getBudgetById(id: string): Budget | undefined {
    return getBudgets().find((b) => b.id === id);
}

// ---------- 集計 ----------

/**
 * 1つの予算のカテゴリ別集計
 */
export function getBudgetSummary(budget: Budget): BudgetSummary {
    const transactions = getTransactionsByBudget(budget.id);

    const categories: CategorySummary[] = ALL_CATEGORIES.map((cat) => {
        const allocated = budget.allocations[cat] || 0;
        const spent = transactions
            .filter((t) => t.category === cat)
            .reduce((sum, t) => sum + t.amount, 0);
        return {
            category: cat,
            allocated,
            spent,
            remaining: allocated - spent,
        };
    });

    const totalAllocated = categories.reduce((s, c) => s + c.allocated, 0);
    const totalSpent = categories.reduce((s, c) => s + c.spent, 0);

    return {
        budget,
        categories,
        totalAllocated,
        totalSpent,
        totalRemaining: totalAllocated - totalSpent,
    };
}

/**
 * 全予算のサマリーリスト
 */
export function getAllBudgetSummaries(): BudgetSummary[] {
    return getBudgets()
        .sort((a, b) => a.name.localeCompare(b.name, "ja"))
        .map(getBudgetSummary);
}

/**
 * 全体の支出合計
 */
export function getTotalSpent(): number {
    return getTransactions().reduce((sum, t) => sum + t.amount, 0);
}

/**
 * 全体の配分合計
 */
export function getTotalAllocated(): number {
    return getBudgets().reduce((sum, b) => {
        return sum + ALL_CATEGORIES.reduce((s, cat) => s + (b.allocations[cat] || 0), 0);
    }, 0);
}

/**
 * カテゴリ別の全体集計
 */
export function getOverallCategorySummary(): CategorySummary[] {
    const budgets = getBudgets();
    const transactions = getTransactions();

    return ALL_CATEGORIES.map((cat) => {
        const allocated = budgets.reduce((s, b) => s + (b.allocations[cat] || 0), 0);
        const spent = transactions
            .filter((t) => t.category === cat)
            .reduce((s, t) => s + t.amount, 0);
        return { category: cat, allocated, spent, remaining: allocated - spent };
    });
}

/**
 * 未割当取引数（budgetId が空の取引）
 */
export function getUnassignedCount(): number {
    return getTransactions().filter((t) => !t.budgetId).length;
}
