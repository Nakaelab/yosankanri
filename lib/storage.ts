import {
    Transaction, Budget, BudgetSummary, CategorySummary,
    ALL_CATEGORIES, ExpenseCategory, CategoryAllocations,
} from "./types";

// ==========================================
// LocalStorage データ永続化
// ==========================================

const TRANSACTIONS_KEY = "budget_app_transactions_v2";
const BUDGETS_KEY = "budget_app_budgets_v2";

// ---------- Transactions ----------

export function getTransactions(): Transaction[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(TRANSACTIONS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveTransaction(tx: Transaction): void {
    const list = getTransactions();
    list.push(tx);
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(list));
}

export function deleteTransaction(id: string): void {
    const list = getTransactions().filter((t) => t.id !== id);
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(list));
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
        const raw = localStorage.getItem(BUDGETS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveBudget(budget: Budget): void {
    const list = getBudgets();
    list.push(budget);
    localStorage.setItem(BUDGETS_KEY, JSON.stringify(list));
}

export function updateBudget(budget: Budget): void {
    const list = getBudgets().map((b) => (b.id === budget.id ? budget : b));
    localStorage.setItem(BUDGETS_KEY, JSON.stringify(list));
}

export function deleteBudget(id: string): void {
    const list = getBudgets().filter((b) => b.id !== id);
    localStorage.setItem(BUDGETS_KEY, JSON.stringify(list));
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
