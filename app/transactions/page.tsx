"use client";

import { useEffect, useRef, useState } from "react";
import { Transaction, CATEGORY_LABELS, CATEGORY_COLORS, Budget, AttachmentMeta, ALL_CATEGORIES, ExpenseCategory } from "@/lib/types";
import { getTransactions, deleteTransaction, getBudgets, saveTransaction } from "@/lib/storage";
import { getCurrentTeacherId } from "@/lib/storage";
import { formatFileSize } from "@/lib/attachments";
import { v4 as uuidv4 } from "uuid";

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

    // Edit modal
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
    const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
    const [editUploading, setEditUploading] = useState(false);
    const editFileInputRef = useRef<HTMLInputElement>(null);

    const reload = () => {
        const txData = getTransactions();
        const bData = getBudgets();
        setTransactions(txData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setBudgets(bData);
    };

    useEffect(() => { setMounted(true); reload(); }, []);

    const handleDelete = (id: string) => {
        if (!confirm("この執行データを削除しますか？\n添付ファイルも削除されます。")) return;
        deleteTransaction(id);
        reload();
    };

    // ---- Edit ----
    const handleEdit = (tx: Transaction) => {
        setEditingTx(tx);
        setEditNewFiles([]);
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

    const handleSaveEdit = async () => {
        if (!editingTx) return;
        if (!editForm.budgetId) { alert("予算を選択してください"); return; }
        if (!editForm.itemName.trim()) { alert("品名を入力してください"); return; }
        if (editForm.amount <= 0) { alert("金額を確認してください"); return; }

        setEditUploading(true);
        const existingAttachments = editingTx.attachments || [];
        let newMetas: AttachmentMeta[] = [];

        // 新しいファイルをアップロード
        for (const file of editNewFiles) {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("transactionId", editingTx.id);
            try {
                const res = await fetch("/api/upload", { method: "POST", body: fd });
                if (res.ok) {
                    newMetas.push(await res.json());
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert(`アップロード失敗: ${file.name}\n${err.error || ""}`);
                }
            } catch (e) {
                alert(`アップロードエラー: ${file.name}`);
            }
        }

        const allAttachments = [...existingAttachments, ...newMetas];

        const updated: Transaction = {
            ...editingTx,
            ...editForm,
            attachments: allAttachments.length > 0 ? allAttachments : undefined,
            attachmentCount: allAttachments.length,
        };

        saveTransaction(updated);
        setEditUploading(false);
        setEditingTx(null);
        setEditNewFiles([]);
        reload();
    };

    const handleCancelEdit = () => {
        setEditingTx(null);
        setEditNewFiles([]);
    };

    const handleEditFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        setEditNewFiles(prev => [...prev, ...Array.from(files)]);
        if (editFileInputRef.current) editFileInputRef.current.value = "";
    };

    const removeEditNewFile = (idx: number) => {
        setEditNewFiles(prev => prev.filter((_, i) => i !== idx));
    };

    // Auto-calc amount in edit form
    useEffect(() => {
        if (editingTx && editForm.unitPrice > 0 && editForm.quantity > 0) {
            setEditForm(prev => ({ ...prev, amount: prev.unitPrice * prev.quantity }));
        }
    }, [editForm.unitPrice, editForm.quantity]);

    // ---- Attachment Preview ----
    const openAttachments = (tx: Transaction) => {
        setPreviewTx(tx);
        const metas = tx.attachments || [];
        setPreviewAttachments(metas);
        if (metas.length > 0) showAttachment(metas[0]);
    };

    const showAttachment = (meta: AttachmentMeta) => {
        setPreviewUrl(meta.storageUrl || null);
        setPreviewName(meta.fileName);
    };

    const closePreview = () => {
        setPreviewTx(null);
        setPreviewAttachments([]);
        setPreviewUrl(null);
        setPreviewName("");
    };

    const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
    const getBudgetName = (id: string) => budgets.find((b) => b.id === id)?.name || "未割当";
    const isLabor = editForm.category === "labor";

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
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            className="p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                                                            onClick={() => handleEdit(tx)}
                                                            title="編集"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                            onClick={() => handleDelete(tx.id)}
                                                            title="削除"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                            </svg>
                                                        </button>
                                                    </div>
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

            {/* ========== Attachment Preview Modal (フルスクリーン) ========== */}
            {previewTx && (
                <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" onClick={closePreview}>
                    {/* Header bar */}
                    <div
                        className="flex items-center justify-between px-5 py-3 bg-gray-900/80 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{previewName || "添付ファイル"}</p>
                            <p className="text-gray-400 text-[11px] truncate">{previewTx.itemName} — {previewTx.date}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                            {previewUrl && (
                                <>
                                    <a
                                        href={previewUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                        </svg>
                                        別タブ
                                    </a>
                                    <a
                                        href={previewUrl}
                                        download={previewName}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs rounded-lg transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                        </svg>
                                        ダウンロード
                                    </a>
                                </>
                            )}
                            <button
                                onClick={closePreview}
                                className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors"
                            >
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* File tabs (複数ファイル) */}
                    {previewAttachments.length > 1 && (
                        <div
                            className="flex gap-1 px-4 py-1.5 bg-gray-800/80 overflow-x-auto shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {previewAttachments.map((att) => (
                                <button
                                    key={att.id}
                                    onClick={() => showAttachment(att)}
                                    className={`px-3 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${previewName === att.fileName
                                        ? "bg-brand-600 text-white"
                                        : "text-gray-300 hover:bg-gray-700"}`}
                                >
                                    {att.fileName}
                                    <span className="text-gray-400 ml-1">({formatFileSize(att.size)})</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Preview area */}
                    <div className="flex-1 min-h-0 overflow-auto" onClick={(e) => e.stopPropagation()}>
                        {previewAttachments.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <p className="text-gray-400 text-sm">添付ファイルのURLが見つかりません</p>
                                <p className="text-gray-600 text-xs mt-1">この執行を編集して再度ファイルを追加してください</p>
                            </div>
                        ) : previewUrl ? (
                            previewName.toLowerCase().endsWith(".pdf") ? (
                                <iframe src={previewUrl} className="w-full h-full border-0" title={previewName} />
                            ) : (
                                <div className="h-full flex items-center justify-center p-4">
                                    <img src={previewUrl} alt={previewName} className="max-w-full max-h-full object-contain" />
                                </div>
                            )
                        ) : (
                            <div className="h-full flex items-center justify-center">
                                <p className="text-gray-400 text-sm">読み込み中...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========== Edit Modal ========== */}
            {editingTx && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={handleCancelEdit}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4 flex flex-col animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-brand-50 to-indigo-50 rounded-t-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">執行データの編集</h3>
                                    <p className="text-[11px] text-gray-500">{editingTx.itemName || "—"} — {editingTx.date}</p>
                                </div>
                            </div>
                            <button onClick={handleCancelEdit} className="w-8 h-8 rounded-lg hover:bg-white/60 flex items-center justify-center transition-colors">
                                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5">
                            {/* 予算・費目 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">予算（研究費）</label>
                                    <select
                                        className="form-select mt-1"
                                        value={editForm.budgetId}
                                        onChange={(e) => setEditForm({ ...editForm, budgetId: e.target.value })}
                                    >
                                        <option value="">-- 選択してください --</option>
                                        {budgets.map((b) => (
                                            <option key={b.id} value={b.id}>{b.name} {b.jCode ? `(${b.jCode})` : ""}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">費目カテゴリ</label>
                                    <select
                                        className="form-select mt-1"
                                        value={editForm.category}
                                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ExpenseCategory })}
                                    >
                                        {ALL_CATEGORIES.map((cat) => (<option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>))}
                                    </select>
                                </div>
                            </div>

                            {/* 伝票・日付 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">伝票番号</label>
                                    <input
                                        type="text"
                                        className="form-input font-mono mt-1"
                                        value={editForm.slipNumber}
                                        onChange={(e) => setEditForm({ ...editForm, slipNumber: e.target.value })}
                                        placeholder="例: P250..."
                                    />
                                </div>
                                <div>
                                    <label className="form-label">{isLabor ? "支払日 / 計上日" : "納品日"}</label>
                                    <input
                                        type="date"
                                        className="form-input mt-1"
                                        value={editForm.date}
                                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* 品名・規格・支払先 */}
                            <div className="space-y-3">
                                <div>
                                    <label className="form-label">{isLabor ? "内容・期間" : "品名"}</label>
                                    <input
                                        type="text"
                                        className="form-input mt-1"
                                        value={editForm.itemName}
                                        onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="form-label">{isLabor ? "対象者名" : "規格等"}</label>
                                        <input
                                            type="text"
                                            className="form-input mt-1"
                                            value={editForm.specification}
                                            onChange={(e) => setEditForm({ ...editForm, specification: e.target.value })}
                                        />
                                    </div>
                                    {!isLabor && (
                                        <div>
                                            <label className="form-label">支払先</label>
                                            <input
                                                type="text"
                                                className="form-input mt-1"
                                                value={editForm.payee}
                                                onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 単価・数量・金額 */}
                            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">金額情報</p>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="form-label">{isLabor ? "支給額 (単価)" : "単価"}</label>
                                        <input
                                            type="number"
                                            className="form-input mt-1"
                                            value={editForm.unitPrice || ""}
                                            onChange={(e) => setEditForm({ ...editForm, unitPrice: parseInt(e.target.value, 10) || 0 })}
                                            min={0}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">{isLabor ? "支給回数" : "数量"}</label>
                                        <input
                                            type="number"
                                            className="form-input mt-1"
                                            value={editForm.quantity}
                                            onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value, 10) || 1 })}
                                            min={1}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">金額（円）</label>
                                        <input
                                            type="number"
                                            className="form-input mt-1 font-bold"
                                            value={editForm.amount || ""}
                                            onChange={(e) => setEditForm({ ...editForm, amount: parseInt(e.target.value, 10) || 0 })}
                                            min={0}
                                        />
                                    </div>
                                </div>
                                {editForm.unitPrice > 0 && editForm.quantity > 1 && (
                                    <p className="text-[11px] text-gray-400">
                                        {editForm.unitPrice.toLocaleString()} × {editForm.quantity} = ¥{(editForm.unitPrice * editForm.quantity).toLocaleString()}
                                    </p>
                                )}
                            </div>

                            {/* 添付ファイル */}
                            <div className="border border-dashed border-gray-200 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold text-gray-700">📎 見積書・添付ファイル</p>
                                        {editingTx.attachmentCount > 0 && (
                                            <p className="text-[11px] text-gray-400">既存: {editingTx.attachmentCount}件</p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => editFileInputRef.current?.click()}
                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-lg transition-colors flex items-center gap-1"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                        </svg>
                                        ファイル追加
                                    </button>
                                    <input
                                        ref={editFileInputRef}
                                        type="file"
                                        accept="image/*,application/pdf"
                                        multiple
                                        className="hidden"
                                        onChange={handleEditFileAdd}
                                    />
                                </div>

                                {/* 既存ファイル一覧 */}
                                {(editingTx.attachments || []).length > 0 && (
                                    <div className="space-y-1">
                                        {(editingTx.attachments || []).map((att) => (
                                            <div key={att.id} className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
                                                <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                                </svg>
                                                <span className="text-xs text-blue-700 truncate flex-1">{att.fileName}</span>
                                                <span className="text-[10px] text-blue-400">{formatFileSize(att.size)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* 新規追加ファイル */}
                                {editNewFiles.length > 0 && (
                                    <div className="space-y-1">
                                        {editNewFiles.map((file, idx) => (
                                            <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                                                <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                </svg>
                                                <span className="text-xs text-green-700 truncate flex-1">{file.name}</span>
                                                <span className="text-[10px] text-green-400">{formatFileSize(file.size)}</span>
                                                <button onClick={() => removeEditNewFile(idx)} className="text-green-400 hover:text-red-500 transition-colors">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                        <p className="text-[10px] text-green-600">↑ 新規追加（保存時にアップロード）</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-2xl">
                            <button className="btn-secondary" onClick={handleCancelEdit} disabled={editUploading}>キャンセル</button>
                            <button
                                className="btn-primary flex items-center gap-2"
                                onClick={handleSaveEdit}
                                disabled={editUploading}
                            >
                                {editUploading ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        アップロード中...
                                    </>
                                ) : "保存する"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
