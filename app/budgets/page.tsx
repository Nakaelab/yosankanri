"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
    Budget, CATEGORY_LABELS, CATEGORY_COLORS, ALL_CATEGORIES,
    CategoryAllocations, emptyAllocations, ExpenseCategory,
} from "@/lib/types";
import { getCurrentTeacherId, getBudgetSummary } from "@/lib/storage";
import { getBudgetsAction, saveBudgetAction, deleteBudgetAction, getTransactionsAction } from "../actions";
import type { BudgetSummary } from "@/lib/types";

export default function BudgetsPage() {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [summaries, setSummaries] = useState<Map<string, BudgetSummary>>(new Map());
    const [mounted, setMounted] = useState(false);
    const [showForm, setShowForm] = useState(false);

    // Form
    const [name, setName] = useState("");
    const [jCode, setJCode] = useState("");
    const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
    const [allocations, setAllocations] = useState<CategoryAllocations>(emptyAllocations());

    const [editId, setEditId] = useState<string | null>(null);
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
            // Re-implement simplified getBudgetSummary logic here
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

    const resetForm = () => {
        setName("");
        setJCode("");
        setFiscalYear(new Date().getFullYear());
        setAllocations(emptyAllocations());
        setEditId(null);
        setCreatedAt("");
        setShowForm(false);
    };

    const handleEdit = (b: Budget) => {
        setName(b.name);
        setJCode(b.jCode || "");
        setFiscalYear(b.fiscalYear);
        setAllocations(b.allocations);
        setEditId(b.id);
        setCreatedAt(b.createdAt);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { alert("研究費名を入力してください"); return; }

        const tid = getCurrentTeacherId();
        const teacherId = tid === "default" ? undefined : tid;

        await saveBudgetAction({
            id: editId || uuidv4(),
            teacherId: teacherId || undefined,
            name: name.trim(),
            jCode: jCode.trim(),
            fiscalYear,
            allocations,
            createdAt: editId ? createdAt : new Date().toISOString(),
        });

        resetForm();
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
                        onClick={() => {
                            if (showForm) resetForm();
                            else setShowForm(true);
                        }}
                    >
                        {showForm ? "閉じる" : (
                            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>新規登録</>
                        )}
                    </button>
                </div>
            </div>

            <div className="p-4 md:p-6 space-y-5">
                {/* Form */}
                {showForm && (
                    <div className="section-card p-5 animate-slide-in">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-bold text-gray-900">{editId ? "予算を編集" : "新規予算登録"}</h2>
                            {editId && <span className="text-xs text-brand-600 bg-brand-50 px-2 py-1 rounded-full">編集中</span>}
                        </div>
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
                            <div>
                                <label className="form-label mb-2">費目別配分額</label>
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
                                                    className="form-input mt-1 text-sm"
                                                    value={allocations[cat] || ""}
                                                    onChange={(e) => updateAlloc(cat, parseInt(e.target.value, 10) || 0)}
                                                    min={0}
                                                    placeholder="0"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-2 text-right text-sm font-bold text-gray-700">
                                    配分合計: {fmt(totalAlloc)}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="submit" className="btn-primary">{editId ? "更新" : "予算を登録"}</button>
                                <button type="button" className="btn-secondary" onClick={resetForm}>キャンセル</button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Budget List */}
                {budgets.length === 0 && !showForm ? (
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
                                <div key={b.id} className="section-card">
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
                                            <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => handleEdit(b)}>編集</button>
                                            <button className="btn-danger text-xs py-1.5 px-3" onClick={() => handleDelete(b.id)}>削除</button>
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
        </div>
    );
}
