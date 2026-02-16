"use client";

import { useEffect, useState } from "react";
import { BudgetSummary, CATEGORY_LABELS, CATEGORY_COLORS, ALL_CATEGORIES } from "@/lib/types";
import { getAllBudgetSummaries, getTotalSpent, getTotalAllocated, getBudgets, getTransactions } from "@/lib/storage";

export default function DashboardPage() {
    const [summaries, setSummaries] = useState<BudgetSummary[]>([]);
    const [totalSpent, setTotalSpent] = useState(0);
    const [totalAllocated, setTotalAllocated] = useState(0);
    const [budgetCount, setBudgetCount] = useState(0);
    const [txCount, setTxCount] = useState(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setSummaries(getAllBudgetSummaries());
        setTotalSpent(getTotalSpent());
        setTotalAllocated(getTotalAllocated());
        setBudgetCount(getBudgets().length);
        setTxCount(getTransactions().length);
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

            <div className="p-6 space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                            // Only show categories that have allocations or spending
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
                                    <div className="px-5 py-2">
                                        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
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
                                        <div className="px-5 pb-4">
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
