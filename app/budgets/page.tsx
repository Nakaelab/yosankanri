"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
    Budget, CATEGORY_LABELS, CATEGORY_COLORS, ALL_CATEGORIES,
    CategoryAllocations, emptyAllocations, ExpenseCategory,
} from "@/lib/types";
import { getCurrentTeacherId } from "@/lib/storage";
import { getBudgetsAction, saveBudgetAction, deleteBudgetAction, getTransactionsAction } from "../actions";
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

    const reload = async () => {
        const tid = getCurrentTeacherId();
        const currentTeacherId = tid === "default" ? undefined : tid;

        const [bData, tData] = await Promise.all([
            getBudgetsAction(currentTeacherId || undefined),
            getTransactionsAction(currentTeacherId || undefined)
        ]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { alert("研究費名を入力してください"); return; }

        const tid = getCurrentTeacherId();
        const teacherId = tid === "default" ? undefined : tid;

        await saveBudgetAction({
            id: editingBudget ? editingBudget.id : uuidv4(),
            teacherId: teacherId || undefined,
            name: name.trim(),
            jCode: jCode.trim(),
            fiscalYear,
            allocations,
            createdAt: editingBudget ? createdAt : new Date().toISOString(),
        });

        closeModal();
        reload();
    };

    const handleDelete = async (id: string) => {
        if (!confirm("この予算を削除しますか？\n紐づく執行データは削除されません。")) return;
        await deleteBudgetAction(id);
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

                                            {/* Edit Button */}
                                            <button
                                                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={closeModal}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col animate-fade-in my-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                            <h3 className="text-base font-bold text-gray-900">
                                {editingBudget ? "予算の編集" : "新規予算登録"}
                            </h3>
                            <button onClick={closeModal} className="w-8 h-8 rounded-lg hover:bg-gray-200 flex items-center justify-center transition-colors">
                                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="form-label">研究費名 *</label>
                                        <input type="text" className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: AMED脳神経チーム代表" />
                                    </div>
                                    <div>
                                        <label className="form-label">Jコード</label>
                                        <input type="text" className="form-input font-mono" value={jCode} onChange={(e) => setJCode(e.target.value)} placeholder="例: J250000252" />
                                    </div>
                                    <div>
                                        <label className="form-label">年度</label>
                                        <input type="number" className="form-input" value={fiscalYear} onChange={(e) => setFiscalYear(parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>

                                {/* Category allocations */}
                                <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                                    <label className="form-label mb-3">費目別配分額</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                        {ALL_CATEGORIES.map((cat) => {
                                            const colors = CATEGORY_COLORS[cat];
                                            return (
                                                <div key={cat} className={`rounded-lg p-3 ${colors.bg} border border-opacity-20`}>
                                                    <label className={`text-[10px] font-bold uppercase tracking-wider ${colors.text}`}>
                                                        {CATEGORY_LABELS[cat]}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        className="form-input mt-1 text-sm bg-white/80"
                                                        value={allocations[cat] || ""}
                                                        onChange={(e) => updateAlloc(cat, parseInt(e.target.value, 10) || 0)}
                                                        min={0}
                                                        placeholder="0"
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-3 text-right text-sm font-bold text-gray-700">
                                        配分合計: {fmt(totalAlloc)}
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50 rounded-b-2xl">
                            <button className="btn-secondary" onClick={closeModal}>キャンセル</button>
                            <button className="btn-primary" onClick={handleSubmit}>
                                {editingBudget ? "更新する" : "登録する"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
