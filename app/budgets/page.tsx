"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
    Budget, CATEGORY_LABELS, CATEGORY_COLORS, ALL_CATEGORIES,
    CategoryAllocations, emptyAllocations, ExpenseCategory,
} from "@/lib/types";
import { getBudgets, saveBudget, deleteBudget, getBudgetSummary } from "@/lib/storage";
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

    const reload = () => {
        const b = getBudgets().sort((a, b) => a.name.localeCompare(b.name, "ja"));
        setBudgets(b);
        const map = new Map<string, BudgetSummary>();
        b.forEach((budget) => map.set(budget.id, getBudgetSummary(budget)));
        setSummaries(map);
    };

    useEffect(() => { setMounted(true); reload(); }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { alert("研究費名を入力してください"); return; }

        saveBudget({
            id: uuidv4(),
            name: name.trim(),
            jCode: jCode.trim(),
            fiscalYear,
            allocations,
            createdAt: new Date().toISOString(),
        });

        setName(""); setJCode(""); setAllocations(emptyAllocations()); setShowForm(false);
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
            <div className="page-header flex items-center justify-between">
                <div>
                    <h1 className="page-title">予算設定</h1>
                    <p className="page-subtitle">研究費予算の登録・管理</p>
                </div>
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? "閉じる" : (
                        <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>新規登録</>
                    )}
                </button>
            </div>

            <div className="p-6 space-y-5">
                {/* Form */}
                {showForm && (
                    <div className="section-card p-5 animate-slide-in">
                        <h2 className="text-sm font-bold text-gray-900 mb-4">新規予算登録</h2>
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
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                                <button type="submit" className="btn-primary">予算を登録</button>
                                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>キャンセル</button>
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
                                    <div className="px-5 py-3 flex items-center justify-between border-b border-gray-50">
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
                                        <div className="flex items-center gap-3">
                                            {s && (
                                                <div className="text-right mr-3">
                                                    <div className="text-[10px] text-gray-400 uppercase">配分合計</div>
                                                    <div className="text-sm font-bold tabular-nums">{fmt(s.totalAllocated)}</div>
                                                </div>
                                            )}
                                            <button className="btn-danger" onClick={() => handleDelete(b.id)}>削除</button>
                                        </div>
                                    </div>

                                    {/* Category breakdown */}
                                    {activeCats.length > 0 && (
                                        <div className="px-5 py-3">
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
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
