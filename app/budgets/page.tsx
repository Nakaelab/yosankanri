"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
    Budget, CATEGORY_LABELS, CATEGORY_COLORS, ALL_CATEGORIES,
    CategoryAllocations, emptyAllocations, ExpenseCategory,
} from "@/lib/types";
import { getCurrentTeacherId, getBudgets, saveBudget, deleteBudget, getTransactions } from "@/lib/storage";
import type { BudgetSummary } from "@/lib/types";

export default function BudgetsPage() {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [summaries, setSummaries] = useState<Map<string, BudgetSummary>>(new Map());
    const [mounted, setMounted] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

    // Form State
    const [name, setName] = useState("");
    const [jCode, setJCode] = useState("");
    const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
    const [allocations, setAllocations] = useState<CategoryAllocations>(emptyAllocations());
    const [createdAt, setCreatedAt] = useState<string>("");

    const reload = () => {
        const bData = getBudgets();
        const tData = getTransactions();

        const bSorted = bData.sort((a, b) => a.name.localeCompare(b.name, "ja"));
        setBudgets(bSorted);

        // Calculate summaries client-side
        const map = new Map<string, BudgetSummary>();
        bSorted.forEach((budget) => {
            const budgetTxs = tData.filter((t) => t.budgetId === budget.id);
            const categories = ALL_CATEGORIES.map((cat) => {
                const allocated = budget.allocations[cat] || 0;
                const spent = budgetTxs
                    .filter((t) => t.category === cat)
                    .reduce((sum, t) => sum + t.amount, 0);
                return { category: cat, allocated, spent, remaining: allocated - spent };
            });
            const totalAllocated = categories.reduce((s, c) => s + c.allocated, 0);
            const totalSpent = categories.reduce((s, c) => s + c.spent, 0);

            map.set(budget.id, {
                budget, categories, totalAllocated, totalSpent,
                totalRemaining: totalAllocated - totalSpent
            });
        });
        setSummaries(map);
    };

    useEffect(() => { setMounted(true); reload(); }, []);

    const openCreateModal = () => {
        setEditingBudget(null);
        setName("");
        setJCode("");
        setFiscalYear(new Date().getFullYear());
        setAllocations(emptyAllocations());
        setCreatedAt("");
        setIsModalOpen(true);
    };

    const openEditModal = (b: Budget) => {
        setEditingBudget(b);
        setName(b.name);
        setJCode(b.jCode || "");
        setFiscalYear(b.fiscalYear);
        setAllocations(b.allocations);
        setCreatedAt(b.createdAt);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingBudget(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { alert("研究費名を入力してください"); return; }

        saveBudget({
            id: editingBudget ? editingBudget.id : uuidv4(),
            name: name.trim(),
            jCode: jCode.trim(),
            fiscalYear,
            allocations,
            createdAt: editingBudget ? createdAt : new Date().toISOString(),
        });

        closeModal();
        reload();
    };

    const handleDelete = (id: string) => {
        if (!confirm("この予算を削除しますか？\n紐づく執行データは削除されません。")) return;
        deleteBudget(id);
        reload();
    };

    const updateAlloc = (cat: ExpenseCategory, value: number) => {
        setAllocations((prev) => ({ ...prev, [cat]: value }));
    };

    const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
    const totalAlloc = ALL_CATEGORIES.reduce((s, c) => s + (allocations[c] || 0), 0);

    if (!mounted) {
        return <div className="flex items-center justify-center h-screen"><div className="text-gray-400 text-sm">読み込み中...</div></div>;
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h1 className="page-title">予算設定</h1>
                        <p className="page-subtitle">研究費予算の登録・管理</p>
                    </div>
                    <button
                        className="btn-primary w-full sm:w-auto"
                        onClick={openCreateModal}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        新規登録
                    </button>
                </div>
            </div>

            <div className="p-4 md:p-6 space-y-5">
                {/* Budget List */}
                {budgets.length === 0 ? (
                    <div className="section-card">
                        <div className="empty-state">
                            <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                            <p className="text-sm">予算が登録されていません</p>
                            <p className="text-xs mt-0.5">上の「新規登録」ボタンから予算を登録してください</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {budgets.map((b) => {
                            const s = summaries.get(b.id);
                            const activeCats = s ? s.categories.filter((c) => c.allocated > 0 || c.spent > 0) : [];

                            return (
                                <div key={b.id} className="section-card relative group">
                                    <div className="px-3 md:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-brand-500" />
                                            <div>
                                                <div className="text-sm font-bold text-gray-900">{b.name}</div>
                                                <div className="text-[11px] text-gray-400">
                                                    {b.fiscalYear}年度
                                                    {b.jCode && <span className="ml-2 font-mono">{b.jCode}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {s && (
                                                <div className="text-right mr-3 hidden sm:block">
                                                    <div className="text-[10px] text-gray-400 uppercase">配分合計</div>
                                                    <div className="text-sm font-bold tabular-nums">{fmt(s.totalAllocated)}</div>
                                                </div>
                                            )}

                                            {/* Edit Button - Uses indigo/blue color to be distinctive */}
                                            <button
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-xs font-medium"
                                                onClick={() => openEditModal(b)}
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                                </svg>
                                                編集
                                            </button>

                                            {/* Delete Button */}
                                            <button
                                                className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1"
                                                onClick={() => handleDelete(b.id)}
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                </svg>
                                                削除
                                            </button>
                                        </div>
                                    </div>

                                    {/* Category breakdown */}
                                    {activeCats.length > 0 && (
                                        <div className="px-5 py-3">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                                                {activeCats.map((c) => {
                                                    const colors = CATEGORY_COLORS[c.category];
                                                    return (
                                                        <div key={c.category} className={`rounded-lg p-2.5 ${colors.bg}`}>
                                                            <div className={`text-[10px] font-bold ${colors.text}`}>{CATEGORY_LABELS[c.category]}</div>
                                                            <div className="text-xs font-bold text-gray-900 mt-1 tabular-nums">{c.allocated.toLocaleString()}</div>
                                                            <div className="text-[10px] text-gray-500 tabular-nums">
                                                                執行: {c.spent.toLocaleString()}
                                                            </div>
                                                            <div className={`text-[10px] font-semibold tabular-nums ${c.remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                                                残: {c.remaining.toLocaleString()}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={closeModal}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 my-6 sm:my-12 animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <form onSubmit={handleSubmit}>
                            {/* Header */}
                            <div className="px-5 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-brand-600 to-brand-700 rounded-t-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-white">
                                            {editingBudget ? "予算の編集" : "新規予算登録"}
                                        </h3>
                                        <p className="text-xs text-white/70">
                                            {editingBudget ? "予算情報を変更してください" : "研究費の予算を登録します"}
                                        </p>
                                    </div>
                                </div>
                                <button type="button" onClick={closeModal} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-5 sm:p-6 space-y-5">
                                {/* Basic Info */}
                                <div>
                                    <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                        </svg>
                                        基本情報
                                    </h4>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                                研究費名 <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="例: AMED脳神経チーム代表"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                                    Jコード
                                                </label>
                                                <input
                                                    type="text"
                                                    className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                                    value={jCode}
                                                    onChange={(e) => setJCode(e.target.value)}
                                                    placeholder="例: J250000252"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                                    年度
                                                </label>
                                                <input
                                                    type="number"
                                                    className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                                    value={fiscalYear}
                                                    onChange={(e) => setFiscalYear(parseInt(e.target.value, 10) || 0)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-gray-100" />

                                {/* Category allocations */}
                                <div>
                                    <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
                                        </svg>
                                        費目別配分額
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {ALL_CATEGORIES.map((cat) => {
                                            const colors = CATEGORY_COLORS[cat];
                                            return (
                                                <div key={cat} className={`rounded-xl p-3 ${colors.bg} border border-gray-100`}>
                                                    <label className={`block text-xs font-bold mb-1.5 ${colors.text}`}>
                                                        {CATEGORY_LABELS[cat]}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                                        value={allocations[cat] || ""}
                                                        onChange={(e) => updateAlloc(cat, parseInt(e.target.value, 10) || 0)}
                                                        min={0}
                                                        placeholder="0"
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-4 flex items-center justify-end gap-2">
                                        <span className="text-xs text-gray-500">配分合計:</span>
                                        <span className="text-lg font-bold text-gray-900 tabular-nums">{fmt(totalAlloc)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer - Inside form so submit works */}
                            <div className="px-5 sm:px-6 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 bg-gray-50 rounded-b-2xl">
                                <button type="button" className="btn-secondary justify-center" onClick={closeModal}>
                                    キャンセル
                                </button>
                                <button type="submit" className="btn-primary justify-center text-base py-2.5 px-6">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                    </svg>
                                    {editingBudget ? "更新する" : "登録する"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
