"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { BudgetSummary, CATEGORY_LABELS, CATEGORY_COLORS, ALL_CATEGORIES, Teacher } from "@/lib/types";
import { getCurrentTeacherId, setCurrentTeacherId } from "@/lib/storage";
import { getTeachersAction, saveTeacherAction, getBudgetsAction, getTransactionsAction } from "@/app/actions";

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

    const loadTeachers = async () => {
        setLoading(true);
        const list = await getTeachersAction();
        setTeachers(list);
        setLoading(false);
    };

    const handleSelect = (id: string) => {
        setCurrentTeacherId(id);
        onSelected();
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        const newTeacher: Teacher = {
            id: uuidv4(),
            name: newName.trim(),
            createdAt: new Date().toISOString(),
        };
        await saveTeacherAction(newTeacher);
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

    useEffect(() => {
        setMounted(true);

        const load = async () => {
            const tid = getCurrentTeacherId();
            const teacherId = tid === "default" ? undefined : tid;

            const [budgets, transactions] = await Promise.all([
                getBudgetsAction(teacherId),
                getTransactionsAction(teacherId)
            ]);

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
        };
        load();
    }, []);

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
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
                    <div className="stat-card">
                        <div className="stat-card-label">予算 / 執行</div>
                        <div className="stat-card-value text-gray-900">
                            {budgetCount}<span className="text-base text-gray-400 ml-1">件</span>
                            <span className="text-base text-gray-300 mx-1">/</span>
                            {txCount}<span className="text-base text-gray-400 ml-1">件</span>
                        </div>
                    </div>
                </div>

                {/* Budget Cards */}
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
                    <div className="space-y-4">
                        {summaries.map((s) => {
                            const usageRate = pct(s.totalSpent, s.totalAllocated);
                            const barColor = usageRate > 100 ? "bg-red-500" : usageRate > 80 ? "bg-amber-500" : "bg-brand-500";
                            const activeCats = s.categories.filter((c) => c.allocated > 0 || c.spent > 0);

                            return (
                                <div key={s.budget.id} className="budget-card">
                                    {/* Header */}
                                    <div className="budget-card-header">
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-brand-500" />
                                            <div>
                                                <div className="budget-card-title">{s.budget.name}</div>
                                                <div className="text-[11px] text-gray-400 mt-0.5">
                                                    {s.budget.fiscalYear}年度
                                                    {s.budget.jCode && (
                                                        <span className="ml-2 font-mono">{s.budget.jCode}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-gray-400">残額</div>
                                            <div className={`text-base font-bold tabular-nums ${s.totalRemaining < 0 ? "text-red-600" : "text-gray-900"}`}>
                                                {fmtYen(s.totalRemaining)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Utilization bar */}
                                    <div className="px-3 md:px-5 py-2">
                                        <div className="flex items-center justify-between text-[10px] md:text-[11px] text-gray-400 mb-1 flex-wrap gap-1">
                                            <span>執行率 {usageRate}%</span>
                                            <span>{fmtYen(s.totalSpent)} / {fmtYen(s.totalAllocated)}</span>
                                        </div>
                                        <div className="utilization-bar">
                                            <div
                                                className={`utilization-fill ${barColor}`}
                                                style={{ width: `${Math.min(usageRate, 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Category breakdown table (like spreadsheet right panel) */}
                                    {activeCats.length > 0 && (
                                        <div className="px-3 md:px-5 pb-4 overflow-x-auto">
                                            <table className="cat-table w-full">
                                                <thead>
                                                    <tr>
                                                        <th>費目</th>
                                                        <th className="text-right">配分額</th>
                                                        <th className="text-right">執行額</th>
                                                        <th className="text-right">残額</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {activeCats.map((c) => {
                                                        const colors = CATEGORY_COLORS[c.category];
                                                        return (
                                                            <tr key={c.category}>
                                                                <td>
                                                                    <span className={`inline-flex items-center gap-1.5 ${colors.text}`}>
                                                                        <span className={`w-1.5 h-1.5 rounded-full ${colors.bar}`} />
                                                                        {CATEGORY_LABELS[c.category]}
                                                                    </span>
                                                                </td>
                                                                <td className="text-right text-gray-600">{fmt(c.allocated)}</td>
                                                                <td className="text-right text-gray-900 font-medium">{fmt(c.spent)}</td>
                                                                <td className={`text-right font-medium ${c.remaining < 0 ? "text-red-600" : "text-gray-600"}`}>
                                                                    {fmt(c.remaining)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    <tr>
                                                        <td className="text-gray-900">合計</td>
                                                        <td className="text-right text-gray-900">{fmt(s.totalAllocated)}</td>
                                                        <td className="text-right text-gray-900">{fmt(s.totalSpent)}</td>
                                                        <td className={`text-right ${s.totalRemaining < 0 ? "text-red-600" : "text-gray-900"}`}>
                                                            {fmt(s.totalRemaining)}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
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
