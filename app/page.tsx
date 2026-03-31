"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import { BudgetSummary, CATEGORY_LABELS, CATEGORY_COLORS, ALL_CATEGORIES, Teacher, Transaction, ExpenseCategory } from "@/lib/types";
import { getCurrentTeacherId, setCurrentTeacherId, getTeachers, saveTeacher, getBudgets, getTransactions, saveTransaction } from "@/lib/storage";

// ===============================================
// Teacher Selection
// ===============================================

function TeacherSelect({ onSelected }: { onSelected: () => void }) {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [newName, setNewName] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTeachers();
    }, []);

    const loadTeachers = () => {
        setLoading(true);
        const list = getTeachers();
        setTeachers(list);
        setLoading(false);
    };

    const handleSelect = (id: string) => {
        setCurrentTeacherId(id);
        onSelected();
    };

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        const newTeacher: Teacher = {
            id: uuidv4(),
            name: newName.trim(),
            createdAt: new Date().toISOString(),
        };
        saveTeacher(newTeacher);
        setCurrentTeacherId(newTeacher.id);
        onSelected();
    };

    const handleDefault = () => {
        setCurrentTeacherId("default");
        onSelected();
    };

    if (loading) {
        return <div className="fixed inset-0 z-50 bg-gray-50 flex items-center justify-center p-4">
            <div className="text-gray-400">読み込み中...</div>
        </div>;
    }

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in">
                <div className="px-6 py-8 text-center">
                    <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">利用者を選択してください(保存版)</h1>
                    <p className="text-sm text-gray-500">研究費の管理を行う先生（ユーザー）を選択します</p>
                </div>

                <div className="px-6 pb-6 space-y-3 max-h-[40vh] overflow-y-auto">
                    {/* Default User (if exists) */}
                    <button
                        onClick={handleDefault}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-brand-500 hover:bg-brand-50 transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-white text-gray-500">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                        </div>
                        <div className="text-left">
                            <div className="font-bold text-gray-900 group-hover:text-brand-700">メインユーザー</div>
                            <div className="text-xs text-gray-400">従来のデータを使用</div>
                        </div>
                        <svg className="w-5 h-5 ml-auto text-gray-300 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                    </button>

                    {/* Teachers List */}
                    {teachers.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => handleSelect(t.id)}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-brand-500 hover:bg-brand-50 transition-all group"
                        >
                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center group-hover:bg-white text-indigo-500">
                                <span className="text-lg font-bold">{t.name[0]}</span>
                            </div>
                            <div className="text-left">
                                <div className="font-bold text-gray-900 group-hover:text-brand-700">{t.name}</div>
                                <div className="text-xs text-gray-400">作成日: {t.createdAt.split("T")[0]}</div>
                            </div>
                            <svg className="w-5 h-5 ml-auto text-gray-300 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                    ))}
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100">
                    {showForm ? (
                        <form onSubmit={handleCreate} className="space-y-3 animate-slide-in">
                            <label className="block text-xs font-bold text-gray-500 uppercase">新しい利用者の追加</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="flex-1 form-input text-sm"
                                    placeholder="先生の名前 (例: 山田先生)"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    autoFocus
                                />
                                <button type="submit" className="btn-primary text-sm whitespace-nowrap">作成</button>
                            </div>
                            <button
                                type="button"
                                className="text-xs text-gray-400 hover:text-gray-600 underline"
                                onClick={() => setShowForm(false)}
                            >
                                キャンセル
                            </button>
                        </form>
                    ) : (
                        <button
                            onClick={() => setShowForm(true)}
                            className="w-full py-2.5 rounded-lg border border-dashed border-gray-300 text-gray-500 text-sm font-medium hover:border-brand-500 hover:text-brand-600 hover:bg-brand-50 transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            新しい利用者を追加
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ===============================================
// Dashboard
// ===============================================

function Dashboard() {
    const [summaries, setSummaries] = useState<BudgetSummary[]>([]);
    const [totalSpent, setTotalSpent] = useState(0);
    const [totalAllocated, setTotalAllocated] = useState(0);
    const [budgetCount, setBudgetCount] = useState(0);
    const [txCount, setTxCount] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
    const [allBudgets, setAllBudgets] = useState<{ id: string; name: string; jCode: string }[]>([]);
    const [txByBudget, setTxByBudget] = useState<Record<string, Transaction[]>>({});
    const [expandedBudgets, setExpandedBudgets] = useState<Record<string, boolean>>({});
    const toggleExpand = (budgetId: string) =>
        setExpandedBudgets(prev => ({ ...prev, [budgetId]: !prev[budgetId] }));

    // Edit transaction modal
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [editForm, setEditForm] = useState({
        slipNumber: "",
        date: "",
        itemName: "",
        specification: "",
        payee: "",
        unitPrice: 0,
        quantity: 1,
        amount: 0,
        category: "goods" as ExpenseCategory,
        budgetId: "",
    });

    useEffect(() => {
        setMounted(true);

        const load = () => {
            const budgets = getBudgets();
            const transactions = getTransactions();

            // Calculate summaries
            const s: BudgetSummary[] = budgets.map(b => {
                const bTxs = transactions.filter(t => t.budgetId === b.id);
                const categories = ALL_CATEGORIES.map(cat => {
                    const allocated = b.allocations[cat] || 0;
                    const spent = bTxs.filter(t => t.category === cat).reduce((sum, t) => sum + t.amount, 0);
                    return { category: cat, allocated, spent, remaining: allocated - spent };
                });
                const totalAllocated = categories.reduce((sum, c) => sum + c.allocated, 0);
                const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);
                return {
                    budget: b,
                    categories,
                    totalAllocated,
                    totalSpent,
                    totalRemaining: totalAllocated - totalSpent
                };
            });

            setSummaries(s);
            setTotalAllocated(s.reduce((sum, item) => sum + item.totalAllocated, 0));
            setTotalSpent(s.reduce((sum, item) => sum + item.totalSpent, 0));
            setBudgetCount(budgets.length);
            setTxCount(transactions.length);
            setAllBudgets(budgets.map(b => ({ id: b.id, name: b.name, jCode: b.jCode })));

            // Recent transactions (newest 5)
            const sorted = [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setRecentTransactions(sorted.slice(0, 5));

            // Group transactions by budgetId (sorted by date desc)
            const byBudget: Record<string, Transaction[]> = {};
            for (const tx of sorted) {
                if (!byBudget[tx.budgetId]) byBudget[tx.budgetId] = [];
                byBudget[tx.budgetId].push(tx);
            }
            setTxByBudget(byBudget);
        };
        load();
    }, []);

    // Edit transaction handlers
    const handleEditTx = (tx: Transaction) => {
        setEditingTx(tx);
        setEditForm({
            slipNumber: tx.slipNumber,
            date: tx.date,
            itemName: tx.itemName,
            specification: tx.specification,
            payee: tx.payee,
            unitPrice: tx.unitPrice,
            quantity: tx.quantity,
            amount: tx.amount,
            category: tx.category,
            budgetId: tx.budgetId,
        });
    };

    const handleSaveEdit = () => {
        if (!editingTx) return;
        if (!editForm.budgetId) { alert("予算を選択してください"); return; }
        if (!editForm.itemName.trim()) { alert("品名を入力してください"); return; }
        if (editForm.amount <= 0) { alert("金額を確認してください"); return; }

        const updated: Transaction = {
            ...editingTx,
            ...editForm,
        };

        saveTransaction(updated);
        setEditingTx(null);
        // Reload data
        window.location.reload();
    };

    const handleCancelEdit = () => {
        setEditingTx(null);
    };

    // Auto-calc amount in edit form
    useEffect(() => {
        if (editingTx) {
            if (editForm.unitPrice > 0 && editForm.quantity > 0) {
                setEditForm(prev => ({ ...prev, amount: prev.unitPrice * prev.quantity }));
            }
        }
    }, [editForm.unitPrice, editForm.quantity]);

    const getBudgetName = (id: string) => allBudgets.find(b => b.id === id)?.name || "未割当";

    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-gray-400 text-sm">読み込み中...</div>
            </div>
        );
    }

    const fmt = (n: number) => n.toLocaleString("ja-JP");
    const fmtYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
    const pct = (spent: number, alloc: number) =>
        alloc > 0 ? Math.min(Math.round((spent / alloc) * 100), 999) : 0;

    const totalRemaining = totalAllocated - totalSpent;

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">ダッシュボード</h1>
                <p className="page-subtitle">研究費予算の概要</p>
            </div>

            <div className="p-4 md:p-6 space-y-6">
                {/* ===== 全体サマリー ===== */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    <div className="stat-card">
                        <div className="stat-card-label">配分総額</div>
                        <div className="stat-card-value text-gray-900">{fmtYen(totalAllocated)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-label">執行総額</div>
                        <div className="stat-card-value text-brand-700">{fmtYen(totalSpent)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-card-label">残額</div>
                        <div className={`stat-card-value ${totalRemaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {fmtYen(totalRemaining)}
                        </div>
                    </div>
                </div>

                {/* ===== 予算カード ===== */}
                {summaries.length === 0 ? (
                    <div className="section-card">
                        <div className="empty-state">
                            <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                            </svg>
                            <p className="text-sm">予算が登録されていません</p>
                            <p className="text-xs mt-0.5">「予算設定」から研究費予算を登録してください</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {summaries.map((s) => {
                            const usageRate = pct(s.totalSpent, s.totalAllocated);
                            const barColor = usageRate > 100 ? "bg-red-500" : usageRate > 80 ? "bg-amber-500" : "bg-brand-500";
                            const activeCats = s.categories.filter((c) => c.allocated > 0 || c.spent > 0);

                            return (
                                <div key={s.budget.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                    {/* ===== 予算ヘッダー ===== */}
                                    <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`w-1.5 h-12 rounded-full flex-shrink-0 ${usageRate > 100 ? "bg-red-400" : usageRate > 80 ? "bg-amber-400" : "bg-brand-500"}`} />
                                                <div className="min-w-0">
                                                    <div className="text-[15px] font-bold text-gray-900 break-words leading-tight">{s.budget.name}</div>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className="text-[11px] text-gray-400">{s.budget.fiscalYear}年度</span>
                                                        {s.budget.jCode && (
                                                            <span className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{s.budget.jCode}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <Link
                                                href="/budgets"
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-xs font-medium flex-shrink-0"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                                </svg>
                                                編集
                                            </Link>
                                        </div>
                                    </div>

                                    {/* ===== 配分・執行・残額（大きく） ===== */}
                                    <div className="px-5 py-4 border-b border-gray-100">
                                        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                                            <div>
                                                <div className="text-[10px] text-gray-400 font-semibold tracking-wider mb-0.5">配分</div>
                                                <div className="text-xl font-bold tabular-nums text-gray-800">{fmtYen(s.totalAllocated)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-brand-500 font-semibold tracking-wider mb-0.5">執行</div>
                                                <div className="text-xl font-bold tabular-nums text-brand-700">{fmtYen(s.totalSpent)}</div>
                                            </div>
                                            <div>
                                                <div className={`text-[10px] font-semibold tracking-wider mb-0.5 ${s.totalRemaining < 0 ? "text-red-400" : "text-emerald-500"}`}>残額</div>
                                                <div className={`text-xl font-bold tabular-nums ${s.totalRemaining < 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtYen(s.totalRemaining)}</div>
                                            </div>
                                            <div className="ml-auto flex items-center gap-2">
                                                <span className="text-xs text-gray-400">執行率</span>
                                                <span className={`text-lg font-bold tabular-nums ${usageRate > 100 ? "text-red-600" : usageRate > 80 ? "text-amber-600" : "text-brand-600"}`}>{usageRate}%</span>
                                            </div>
                                        </div>
                                        <div className="mt-3 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                                style={{ width: `${Math.min(usageRate, 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* ===== 費目タイル ===== */}
                                    {activeCats.length > 0 && (
                                        <div className="p-4">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                                                {activeCats.map((c) => {
                                                    const colors = CATEGORY_COLORS[c.category];
                                                    const catPct = c.allocated > 0 ? Math.min(Math.round((c.spent / c.allocated) * 100), 100) : 0;
                                                    const barCol = catPct >= 100 ? "bg-red-400" : catPct >= 80 ? "bg-amber-400" : colors.bar;
                                                    const isOver = c.remaining < 0;
                                                    return (
                                                        <div key={c.category} className={`rounded-xl border p-3 flex flex-col gap-2 ${colors.bg}`}>
                                                            {/* カテゴリ名 */}
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.bar}`} />
                                                                <span className={`text-xs font-bold ${colors.text}`}>{CATEGORY_LABELS[c.category]}</span>
                                                            </div>
                                                            {/* 残額（大きく） */}
                                                            <div className={`text-base font-bold tabular-nums leading-none ${isOver ? "text-red-600" : "text-gray-800"}`}>
                                                                {isOver ? "▲" : ""}{fmtYen(Math.abs(c.remaining))}
                                                            </div>
                                                            {/* 配分・執行 */}
                                                            <div className="space-y-0.5">
                                                                <div className="flex justify-between text-[10px] text-gray-500">
                                                                    <span>配分</span>
                                                                    <span className="font-medium tabular-nums">¥{fmt(c.allocated)}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">執行</span>
                                                                    <span className="font-bold tabular-nums text-gray-900">¥{fmt(c.spent)}</span>
                                                                </div>
                                                                <div className={`flex justify-between font-bold pt-1 border-t border-gray-100 ${isOver ? "text-red-600" : "text-emerald-600"}`}>
                                                                    <span>残額</span>
                                                                    <span className="tabular-nums">{isOver ? "▲" : ""}¥{fmt(Math.abs(c.remaining))}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* ===== 執行明細アコーディオン ===== */}
                                    {(() => {
                                        const bTxs = txByBudget[s.budget.id] || [];
                                        if (bTxs.length === 0) return null;
                                        const isOpen = expandedBudgets[s.budget.id] ?? false;
                                        let running = s.totalAllocated;
                                        const rowsAsc = [...bTxs].reverse();
                                        const accumulated: { tx: Transaction; remaining: number }[] = [];
                                        for (const tx of rowsAsc) {
                                            running -= tx.amount;
                                            accumulated.push({ tx, remaining: running });
                                        }
                                        const rowsDesc = accumulated.reverse();

                                        return (
                                            <div className="border-t border-gray-100">
                                                <button
                                                    onClick={() => toggleExpand(s.budget.id)}
                                                    className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                                        </svg>
                                                        執行明細 ({bTxs.length}件)
                                                    </span>
                                                    <svg
                                                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                                        fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                                    </svg>
                                                </button>

                                                {isOpen && (
                                                    <div className="px-4 pb-4 overflow-x-auto">
                                                        <table className="w-full text-xs border-collapse">
                                                            <thead>
                                                                <tr className="border-b border-gray-100">
                                                                    <th className="text-left py-2 px-2 text-gray-400 font-semibold">日付</th>
                                                                    <th className="text-left py-2 px-2 text-gray-400 font-semibold">品名</th>
                                                                    <th className="text-left py-2 px-2 text-gray-400 font-semibold hidden sm:table-cell">費目</th>
                                                                    <th className="text-right py-2 px-2 text-gray-400 font-semibold">金額</th>
                                                                    <th className="text-right py-2 px-2 text-gray-400 font-semibold">残額</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rowsDesc.map(({ tx, remaining }) => {
                                                                    const catColor = CATEGORY_COLORS[tx.category];
                                                                    return (
                                                                        <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                                                            <td className="py-2 px-2 text-gray-400 whitespace-nowrap font-mono">
                                                                                {tx.date === "未定" ? "未定" : tx.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3")}
                                                                            </td>
                                                                            <td className="py-2 px-2 text-gray-700 max-w-[140px]">
                                                                                <div className="truncate font-medium">{tx.itemName}</div>
                                                                                {tx.specification && (
                                                                                    <div className="text-[10px] text-gray-400 truncate">{tx.specification}</div>
                                                                                )}
                                                                            </td>
                                                                            <td className="py-2 px-2 hidden sm:table-cell">
                                                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${catColor.bg} ${catColor.text}`}>
                                                                                    <span className={`w-1.5 h-1.5 rounded-full ${catColor.bar}`} />
                                                                                    {CATEGORY_LABELS[tx.category]}
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-2 px-2 text-right tabular-nums font-bold text-gray-800 whitespace-nowrap">
                                                                                ¥{fmt(tx.amount)}
                                                                            </td>
                                                                            <td className={`py-2 px-2 text-right tabular-nums font-bold whitespace-nowrap ${remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                                                                {remaining < 0 ? "▲" : ""}¥{fmt(Math.abs(remaining))}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                        <div className="mt-2 text-right">
                                                            <Link href="/transactions" className="text-[11px] text-brand-600 hover:underline font-medium">
                                                                執行一覧で全件見る →
                                                            </Link>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                )}


            </div>

            {/* Transaction Edit Modal */}
            {
                editingTx && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={handleCancelEdit}>
                        <div
                            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col animate-fade-in my-8"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                                <h3 className="text-base font-bold text-gray-900">執行データの編集</h3>
                                <button onClick={handleCancelEdit} className="w-8 h-8 rounded-lg hover:bg-gray-200 flex items-center justify-center transition-colors">
                                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-4">
                                {/* Budget Selection */}
                                <div>
                                    <label className="form-label">予算（研究費）</label>
                                    <select
                                        className="form-select mt-1"
                                        value={editForm.budgetId}
                                        onChange={(e) => setEditForm({ ...editForm, budgetId: e.target.value })}
                                    >
                                        <option value="">-- 選択してください --</option>
                                        {allBudgets.map((b) => (
                                            <option key={b.id} value={b.id}>{b.name} {b.jCode ? `(${b.jCode})` : ""}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="form-label">伝票番号</label>
                                        <input
                                            type="text"
                                            className="form-input font-mono"
                                            value={editForm.slipNumber}
                                            onChange={(e) => setEditForm({ ...editForm, slipNumber: e.target.value })}
                                            placeholder="例: P250..."
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">費目カテゴリ</label>
                                        <select
                                            className="form-select"
                                            value={editForm.category}
                                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ExpenseCategory })}
                                        >
                                            {ALL_CATEGORIES.map((cat) => (<option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label">{editForm.category === "labor" ? "支払日 / 計上日" : "納品日"}</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={editForm.date}
                                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">{editForm.category === "labor" ? "内容・期間" : "品名"}</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={editForm.itemName}
                                            onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">{editForm.category === "labor" ? "対象者名" : "規格等"}</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={editForm.specification}
                                            onChange={(e) => setEditForm({ ...editForm, specification: e.target.value })}
                                        />
                                    </div>
                                    {editForm.category !== "labor" && (
                                        <div>
                                            <label className="form-label">支払先</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={editForm.payee}
                                                onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    {editForm.category !== "labor" && (
                                        <>
                                            <div>
                                                <label className="form-label">単価</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={editForm.unitPrice || ""}
                                                    onChange={(e) => setEditForm({ ...editForm, unitPrice: parseInt(e.target.value, 10) || 0 })}
                                                    min={0}
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">数量</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    value={editForm.quantity}
                                                    onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value, 10) || 1 })}
                                                    min={1}
                                                />
                                            </div>
                                        </>
                                    )}
                                    <div className="md:col-span-2">
                                        <label className="form-label">{editForm.category === "labor" ? "金額（総額）" : "金額（円）"}</label>
                                        <input
                                            type="number"
                                            className="form-input text-lg font-bold"
                                            value={editForm.amount || ""}
                                            onChange={(e) => setEditForm({ ...editForm, amount: parseInt(e.target.value, 10) || 0, ...(editForm.category === "labor" ? { unitPrice: parseInt(e.target.value, 10) || 0, quantity: 1 } : {}) })}
                                            min={0}
                                        />
                                        {editForm.category !== "labor" && editForm.unitPrice > 0 && editForm.quantity > 1 && (
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                単価 {editForm.unitPrice.toLocaleString()} × 数量 {editForm.quantity} = {(editForm.unitPrice * editForm.quantity).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50 rounded-b-2xl">
                                <button className="btn-secondary" onClick={handleCancelEdit}>キャンセル</button>
                                <button className="btn-primary" onClick={handleSaveEdit}>保存する</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}

// ===============================================
// Root Page
// ===============================================

export default function Page() {
    const [teacherId, setTeacherId] = useState<string | null>(null);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        // 現在のユーザーIDを取得
        // 注意: storage.ts の関数はSSR時にnullを返すことがあるため、クライアントサイドで確認
        const current = getCurrentTeacherId();
        setTeacherId(current);
        setInitialized(true);
    }, []);

    const handleTeacherSelected = () => {
        const current = getCurrentTeacherId();
        setTeacherId(current);
        window.location.reload(); // データ読み込みのためにリロード
    };

    if (!initialized) return null;

    if (!teacherId) {
        return <TeacherSelect onSelected={handleTeacherSelected} />;
    }

    return <Dashboard />;
}
