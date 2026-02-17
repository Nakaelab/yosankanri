"use client";

import { useEffect, useState } from "react";
import { Transaction, CATEGORY_LABELS, CATEGORY_COLORS, Budget } from "@/lib/types";
import { getTransactionsAction, deleteTransactionAction, getBudgetsAction } from "../actions";
import { getCurrentTeacherId } from "@/lib/storage";
import {
    getAttachmentsByTransaction, getAttachment, deleteAttachmentsByTransaction,
    arrayBufferToUrl, formatFileSize,
    type AttachmentMeta, type AttachmentRecord,
} from "@/lib/attachments";

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [filterBudgetId, setFilterBudgetId] = useState("all");
    const [mounted, setMounted] = useState(false);

    // Attachment preview modal
    const [previewTx, setPreviewTx] = useState<Transaction | null>(null);
    const [previewAttachments, setPreviewAttachments] = useState<AttachmentMeta[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState("");

    const reload = async () => {
        const tid = getCurrentTeacherId();
        const currentTeacherId = tid === "default" ? undefined : tid;

        const [txData, bData] = await Promise.all([
            getTransactionsAction(currentTeacherId || undefined),
            getBudgetsAction(currentTeacherId || undefined)
        ]);

        setTransactions(
            txData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
        setBudgets(bData);
    };

    useEffect(() => { setMounted(true); reload(); }, []);

    const handleDelete = async (id: string) => {
        if (!confirm("この執行データを削除しますか？\n添付ファイルも削除されます。")) return;
        await deleteAttachmentsByTransaction(id);
        await deleteTransactionAction(id);
        reload();
    };

    const openAttachments = async (tx: Transaction) => {
        setPreviewTx(tx);
        const metas = await getAttachmentsByTransaction(tx.id);
        setPreviewAttachments(metas);
        if (metas.length > 0) {
            await showAttachment(metas[0].id, metas[0].fileName);
        }
    };

    const showAttachment = async (id: string, fileName: string) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const record = await getAttachment(id);
        if (record) {
            setPreviewUrl(arrayBufferToUrl(record.data, record.mimeType));
            setPreviewName(fileName);
        }
    };

    const closePreview = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewTx(null);
        setPreviewAttachments([]);
        setPreviewUrl(null);
        setPreviewName("");
    };

    const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
    const getBudgetName = (id: string) => budgets.find((b) => b.id === id)?.name || "未割当";

    const filtered = filterBudgetId === "all"
        ? transactions
        : transactions.filter((t) => t.budgetId === filterBudgetId);

    const filteredTotal = filtered.reduce((s, t) => s + t.amount, 0);

    if (!mounted) {
        return <div className="flex items-center justify-center h-screen"><div className="text-gray-400 text-sm">読み込み中...</div></div>;
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h1 className="page-title">取引一覧</h1>
                        <p className="page-subtitle">全支出明細</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="text-left sm:text-right">
                            <div className="text-[10px] text-gray-400 uppercase">表示中の合計</div>
                            <div className="text-sm font-bold tabular-nums">{fmt(filteredTotal)}</div>
                        </div>
                        <select
                            className="form-select text-xs py-1.5 w-full sm:w-52"
                            value={filterBudgetId}
                            onChange={(e) => setFilterBudgetId(e.target.value)}
                        >
                            <option value="all">すべての予算 ({transactions.length}件)</option>
                            {budgets.map((b) => {
                                const count = transactions.filter((t) => t.budgetId === b.id).length;
                                return <option key={b.id} value={b.id}>{b.name} ({count}件)</option>;
                            })}
                        </select>
                    </div>
                </div>
            </div>


            <div className="p-3 md:p-6">
                <div className="section-card">
                    <div className="section-header">
                        <div className="section-title">支出明細</div>
                        <span className="text-[11px] text-gray-400">{filtered.length} 件</span>
                    </div>

                    {filtered.length === 0 ? (
                        <div className="empty-state">
                            <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                            <p className="text-sm">執行データがありません</p>
                            <p className="text-xs mt-0.5">「執行登録」から追加してください</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>No.</th>
                                        <th>納品日</th>
                                        <th>品名</th>
                                        <th>規格等</th>
                                        <th>支払先</th>
                                        <th className="text-right">単価</th>
                                        <th className="text-center">数量</th>
                                        <th className="text-right">金額</th>
                                        <th>費目</th>
                                        <th>予算</th>
                                        <th className="text-center">📎</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((tx) => {
                                        const colors = CATEGORY_COLORS[tx.category];
                                        const hasAttach = (tx.attachmentCount || 0) > 0;
                                        return (
                                            <tr key={tx.id}>
                                                <td className="font-mono text-[11px] text-gray-500 whitespace-nowrap">{tx.slipNumber || "—"}</td>
                                                <td className="whitespace-nowrap text-[12px]">{tx.date}</td>
                                                <td className="font-medium max-w-[180px] truncate">{tx.itemName || "—"}</td>
                                                <td className="max-w-[140px] truncate text-gray-500 text-[12px]">{tx.specification || "—"}</td>
                                                <td className="text-[12px] text-gray-500">{tx.payee || "—"}</td>
                                                <td className="text-right tabular-nums text-[12px]">{tx.unitPrice > 0 ? tx.unitPrice.toLocaleString() : "—"}</td>
                                                <td className="text-center tabular-nums text-[12px]">{tx.quantity}</td>
                                                <td className="text-right font-medium tabular-nums whitespace-nowrap">{fmt(tx.amount)}</td>
                                                <td>
                                                    <span className={`badge ${colors.bg} ${colors.text}`}>
                                                        {CATEGORY_LABELS[tx.category]}
                                                    </span>
                                                </td>
                                                <td className="text-[11px] text-gray-400 max-w-[100px] truncate">{getBudgetName(tx.budgetId)}</td>
                                                <td className="text-center">
                                                    {hasAttach ? (
                                                        <button
                                                            className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 text-xs font-medium transition-colors"
                                                            onClick={() => openAttachments(tx)}
                                                            title="添付ファイルを表示"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                                            </svg>
                                                            {tx.attachmentCount}
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-300 text-[11px]">—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <button className="btn-danger" onClick={() => handleDelete(tx.id)}>削除</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Attachment Preview Modal */}
            {
                previewTx && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={closePreview}>
                        <div
                            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col animate-fade-in"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">添付ファイル</h3>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                        {previewTx.itemName} — {previewTx.date}
                                    </p>
                                </div>
                                <button onClick={closePreview} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* File List */}
                            {previewAttachments.length > 1 && (
                                <div className="px-6 py-2 border-b border-gray-50 flex gap-2 overflow-x-auto">
                                    {previewAttachments.map((att) => (
                                        <button
                                            key={att.id}
                                            onClick={() => showAttachment(att.id, att.fileName)}
                                            className={`px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${previewName === att.fileName
                                                ? "bg-brand-50 text-brand-700"
                                                : "text-gray-500 hover:bg-gray-50"
                                                }`}
                                        >
                                            {att.fileName}
                                            <span className="text-gray-400 ml-1">({formatFileSize(att.size)})</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Preview */}
                            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gray-50/50">
                                {previewUrl ? (
                                    previewName.toLowerCase().endsWith(".pdf") ? (
                                        <iframe src={previewUrl} className="w-full h-[60vh] rounded-lg border border-gray-200" />
                                    ) : (
                                        <img src={previewUrl} alt={previewName} className="max-w-full max-h-[60vh] rounded-lg shadow-lg" />
                                    )
                                ) : (
                                    <p className="text-gray-400 text-sm">ファイルを読み込み中...</p>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-[11px] text-gray-400">{previewName}</span>
                                <button className="btn-secondary text-xs" onClick={closePreview}>閉じる</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
