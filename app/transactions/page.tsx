"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Transaction, CATEGORY_LABELS, CATEGORY_COLORS, Budget, AttachmentMeta, ALL_CATEGORIES, ExpenseCategory } from "@/lib/types";
import { getTransactions, deleteTransaction, getBudgets, saveTransaction } from "@/lib/storage";
import { getCurrentTeacherId } from "@/lib/storage";
import { formatFileSize } from "@/lib/attachments";

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [filterBudgetId, setFilterBudgetId] = useState("all");
    const [mounted, setMounted] = useState(false);

    // Attachment preview
    const [previewTx, setPreviewTx] = useState<Transaction | null>(null);
    const [previewAttachments, setPreviewAttachments] = useState<AttachmentMeta[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState("");

    // Edit modal
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [editForm, setEditForm] = useState({
        slipNumber: "", date: "", itemName: "", specification: "", payee: "",
        unitPrice: 0, quantity: 1, amount: 0,
        category: "goods" as ExpenseCategory, budgetId: "",
    });
    const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
    const [editRemovedIds, setEditRemovedIds] = useState<string[]>([]);
    const [editUploading, setEditUploading] = useState(false);
    const editFileInputRef = useRef<HTMLInputElement>(null);

    const reload = () => {
        setTransactions(getTransactions().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setBudgets(getBudgets());
    };

    useEffect(() => { setMounted(true); reload(); }, []);

    const handleDelete = (id: string) => {
        if (!confirm("この執行データを削除しますか？\n添付ファイルも削除されます。")) return;
        deleteTransaction(id); reload();
    };

    const handleEdit = (tx: Transaction) => {
        setEditingTx(tx); setEditNewFiles([]); setEditRemovedIds([]);
        setEditForm({ slipNumber: tx.slipNumber, date: tx.date, itemName: tx.itemName, specification: tx.specification, payee: tx.payee, unitPrice: tx.unitPrice, quantity: tx.quantity, amount: tx.amount, category: tx.category, budgetId: tx.budgetId });
    };

    const handleSaveEdit = async () => {
        if (!editingTx) return;
        if (!editForm.budgetId) { alert("予算を選択してください"); return; }
        if (!editForm.itemName.trim()) { alert("品名を入力してください"); return; }
        if (editForm.amount <= 0) { alert("金額を確認してください"); return; }
        setEditUploading(true);
        const newMetas: AttachmentMeta[] = [];
        for (const file of editNewFiles) {
            const fd = new FormData();
            fd.append("file", file); fd.append("transactionId", editingTx.id);
            try {
                const res = await fetch("/api/upload", { method: "POST", body: fd });
                if (res.ok) newMetas.push(await res.json());
                else alert(`アップロード失敗: ${file.name}`);
            } catch { alert(`アップロードエラー: ${file.name}`); }
        }
        const keptAttachments = (editingTx.attachments || []).filter(a => !editRemovedIds.includes(a.id));
        const allAttachments = [...keptAttachments, ...newMetas];
        saveTransaction({ ...editingTx, ...editForm, attachments: allAttachments.length > 0 ? allAttachments : undefined, attachmentCount: allAttachments.length });
        setEditUploading(false); setEditingTx(null); setEditNewFiles([]); setEditRemovedIds([]); reload();
    };

    const handleCancelEdit = () => { setEditingTx(null); setEditNewFiles([]); setEditRemovedIds([]); };

    const handleEditFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        setEditNewFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        if (editFileInputRef.current) editFileInputRef.current.value = "";
    };
    const removeEditNewFile = (idx: number) => setEditNewFiles(prev => prev.filter((_, i) => i !== idx));

    useEffect(() => {
        if (editingTx && editForm.unitPrice > 0 && editForm.quantity > 0)
            setEditForm(prev => ({ ...prev, amount: prev.unitPrice * prev.quantity }));
    }, [editForm.unitPrice, editForm.quantity]);

    const openAttachments = (tx: Transaction) => {
        setPreviewTx(tx);
        const metas = tx.attachments || [];
        setPreviewAttachments(metas);
        if (metas.length > 0) showAttachment(metas[0]);
    };
    const showAttachment = (meta: AttachmentMeta) => { setPreviewUrl(meta.storageUrl || null); setPreviewName(meta.fileName); };
    const closePreview = () => { setPreviewTx(null); setPreviewAttachments([]); setPreviewUrl(null); setPreviewName(""); };

    const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
    const getBudgetName = (id: string) => budgets.find((b) => b.id === id)?.name || "未割当";
    const isLabor = editForm.category === "labor";

    const filtered = filterBudgetId === "all" ? transactions : transactions.filter((t) => t.budgetId === filterBudgetId);
    const filteredTotal = filtered.reduce((s, t) => s + t.amount, 0);

    const selectedBudget = filterBudgetId === "all" ? null : budgets.find((b) => b.id === filterBudgetId);
    let budgetAllocated = 0;
    let budgetRemaining = 0;
    if (selectedBudget) {
        budgetAllocated = ALL_CATEGORIES.reduce((s, cat) => s + (selectedBudget.allocations[cat] || 0), 0);
        budgetRemaining = budgetAllocated - filteredTotal;
    }

    if (!mounted) return <div className="flex items-center justify-center h-screen"><div className="text-gray-400 text-sm">読み込み中...</div></div>;

    return (
        <div className="animate-fade-in">
            {/* Page Header */}
            <div className="page-header">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h1 className="page-title">取引一覧</h1>
                        <p className="page-subtitle">全支出明細</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        {selectedBudget ? (
                            <div className="flex gap-4 text-right sm:pr-4 sm:border-r border-gray-200">
                                <div>
                                    <div className="text-[10px] text-gray-400 uppercase">配分総額</div>
                                    <div className="text-sm font-bold tabular-nums text-gray-900">{fmt(budgetAllocated)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-400 uppercase">執行済</div>
                                    <div className="text-sm font-bold tabular-nums text-brand-700">{fmt(filteredTotal)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-400 uppercase">残額</div>
                                    <div className={`text-sm font-bold tabular-nums ${budgetRemaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
                                        {fmt(budgetRemaining)}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-left sm:text-right">
                                <div className="text-[10px] text-gray-400 uppercase">表示中の合計</div>
                                <div className="text-sm font-bold tabular-nums">{fmt(filteredTotal)}</div>
                            </div>
                        )}
                        <select className="form-select text-xs py-1.5 w-full sm:w-52" value={filterBudgetId} onChange={(e) => setFilterBudgetId(e.target.value)}>
                            <option value="all">すべての予算 ({transactions.length}件)</option>
                            {budgets.map((b) => <option key={b.id} value={b.id}>{b.name} ({transactions.filter((t) => t.budgetId === b.id).length}件)</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="p-3 md:p-6">
                <div className="section-card">
                    <div className="section-header">
                        <div className="section-title">支出明細</div>
                        <span className="text-[11px] text-gray-400">{filtered.length} 件</span>
                    </div>
                    {filtered.length === 0 ? (
                        <div className="empty-state">
                            <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                            <p className="text-sm">執行データがありません</p>
                            <p className="text-xs mt-0.5">「執行登録」から追加してください</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>No.</th><th>納品日</th><th>品名</th><th>規格等</th><th>支払先</th>
                                        <th className="text-right">単価</th><th className="text-center">数量</th>
                                        <th className="text-right">金額</th><th>費目</th><th>予算</th>
                                        <th className="text-center">📎</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((tx) => {
                                        const colors = CATEGORY_COLORS[tx.category];
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
                                                <td><span className={`badge ${colors.bg} ${colors.text}`}>{CATEGORY_LABELS[tx.category]}</span></td>
                                                <td className="text-[11px] text-gray-400 max-w-[100px] truncate">{getBudgetName(tx.budgetId)}</td>
                                                <td className="text-center">
                                                    {(tx.attachmentCount || 0) > 0 ? (
                                                        <button className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 text-xs font-medium" onClick={() => openAttachments(tx)}>
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg>
                                                            {tx.attachmentCount}
                                                        </button>
                                                    ) : <span className="text-gray-300 text-[11px]">—</span>}
                                                </td>
                                                <td>
                                                    <div className="flex items-center gap-1">
                                                        <button className="p-1 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded" onClick={() => handleEdit(tx)}>
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                                                        </button>
                                                        <button className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" onClick={() => handleDelete(tx.id)}>
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
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

            {/* ===== Attachment Preview Modal (portal to body) ===== */}
            {previewTx && createPortal(
                <div className="fixed inset-0 flex flex-col bg-black/95" style={{ zIndex: 9999 }} onClick={closePreview}>
                    <div className="flex items-center justify-between px-5 py-3 bg-gray-900 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{previewName || "添付ファイル"}</p>
                            <p className="text-gray-400 text-[11px]">{previewTx.itemName} — {previewTx.date}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                            {previewUrl && (
                                <>
                                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                                        別タブ
                                    </a>
                                    <a href={previewUrl} download={previewName} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs rounded-lg">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                                        DL
                                    </a>
                                </>
                            )}
                            <button onClick={closePreview} className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>
                    {previewAttachments.length > 1 && (
                        <div className="flex gap-1 px-4 py-1.5 bg-gray-800 overflow-x-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                            {previewAttachments.map((att) => (
                                <button key={att.id} onClick={() => showAttachment(att)}
                                    className={`px-3 py-1 rounded text-[11px] whitespace-nowrap ${previewName === att.fileName ? "bg-brand-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}>
                                    {att.fileName}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex-1 relative" style={{ minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
                        {previewUrl ? (
                            previewName.toLowerCase().endsWith(".pdf") ? (
                                <iframe src={previewUrl} title={previewName} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center p-4">
                                    <img src={previewUrl} alt={previewName} className="max-w-full max-h-full object-contain" />
                                </div>
                            )
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <p className="text-gray-400 text-sm">読み込み中...</p>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* ===== Edit Modal (portal to body — avoids overflow-x:hidden stacking issue) ===== */}
            {editingTx && createPortal(
                <div
                    style={{ position: "fixed", inset: 0, zIndex: 9999, backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "1rem" }}
                    onClick={handleCancelEdit}
                >
                    <div
                        style={{ background: "white", borderRadius: "1rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)", width: "100%", maxWidth: "36rem", flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-brand-50 to-indigo-50 rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">執行データの編集</h3>
                                    <p className="text-[10px] text-gray-400 truncate max-w-xs">{editingTx.itemName || "—"} — {editingTx.date}</p>
                                </div>
                            </div>
                            <button onClick={handleCancelEdit} className="w-7 h-7 rounded-lg hover:bg-white/60 flex items-center justify-center">
                                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-4 py-3 space-y-2">
                            {/* 予算 + 費目 */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">予算</label>
                                    <select className="form-select text-xs py-1" value={editForm.budgetId} onChange={(e) => setEditForm({ ...editForm, budgetId: e.target.value })}>
                                        <option value="">-- 選択 --</option>
                                        {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}{b.jCode ? ` (${b.jCode})` : ""}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">費目</label>
                                    <select className="form-select text-xs py-1" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ExpenseCategory })}>
                                        {ALL_CATEGORIES.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* 伝票 + 日付 */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">伝票番号</label>
                                    <input type="text" className="form-input font-mono text-xs py-1" value={editForm.slipNumber} onChange={(e) => setEditForm({ ...editForm, slipNumber: e.target.value })} placeholder="例: P250..." />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">{isLabor ? "支払日" : "納品日"}</label>
                                    <input type="date" className="form-input text-xs py-1" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                                </div>
                            </div>

                            {/* 品名 */}
                            <div>
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">{isLabor ? "内容・期間" : "品名"}</label>
                                <input type="text" className="form-input text-xs py-1" value={editForm.itemName} onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })} />
                            </div>

                            {/* 規格 + 支払先 */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">{isLabor ? "対象者名" : "規格等"}</label>
                                    <input type="text" className="form-input text-xs py-1" value={editForm.specification} onChange={(e) => setEditForm({ ...editForm, specification: e.target.value })} />
                                </div>
                                {!isLabor && (
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">支払先</label>
                                        <input type="text" className="form-input text-xs py-1" value={editForm.payee} onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })} />
                                    </div>
                                )}
                            </div>

                            {/* 単価 + 数量 + 金額 */}
                            {isLabor ? (
                                <div className="bg-brand-50/60 rounded-xl px-3 py-2">
                                    <label className="text-[9px] font-bold text-brand-600 uppercase tracking-wide block mb-0.5">金額（総額）</label>
                                    <input type="number" className="form-input text-xs py-1 font-bold w-full" value={editForm.amount || ""} onChange={(e) => setEditForm({ ...editForm, amount: parseInt(e.target.value, 10) || 0, unitPrice: parseInt(e.target.value, 10) || 0, quantity: 1 })} min={0} />
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-2 bg-brand-50/60 rounded-xl px-3 py-2">
                                    <div>
                                        <label className="text-[9px] font-bold text-brand-600 uppercase tracking-wide block mb-0.5">単価</label>
                                        <input type="number" className="form-input text-xs py-1" value={editForm.unitPrice || ""} onChange={(e) => setEditForm({ ...editForm, unitPrice: parseInt(e.target.value, 10) || 0 })} min={0} />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-brand-600 uppercase tracking-wide block mb-0.5">数量</label>
                                        <input type="number" className="form-input text-xs py-1" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value, 10) || 1 })} min={1} />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-brand-600 uppercase tracking-wide block mb-0.5">金額（円）</label>
                                        <input type="number" className="form-input text-xs py-1 font-bold" value={editForm.amount || ""} onChange={(e) => setEditForm({ ...editForm, amount: parseInt(e.target.value, 10) || 0 })} min={0} />
                                    </div>
                                </div>
                            )}

                            {/* 添付ファイル */}
                            <div className="border border-dashed border-gray-200 rounded-xl px-3 py-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-semibold text-gray-600">📎 見積書・添付</span>
                                        {(editingTx.attachmentCount || 0) > 0 && <span className="text-[10px] text-blue-400">既存 {(editingTx.attachmentCount || 0) - editRemovedIds.length}件</span>}
                                        {editRemovedIds.length > 0 && <span className="text-[10px] text-red-400">-{editRemovedIds.length}件削除</span>}
                                        {editNewFiles.length > 0 && <span className="text-[10px] text-green-500">+{editNewFiles.length}件</span>}
                                    </div>
                                    <button type="button" onClick={() => editFileInputRef.current?.click()} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] rounded-lg flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                        追加
                                    </button>
                                    <input ref={editFileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleEditFileAdd} />
                                </div>
                                {((editingTx.attachments || []).length > 0 || editNewFiles.length > 0) && (
                                    <div className="mt-1.5 space-y-1 max-h-16 overflow-y-auto">
                                        {(editingTx.attachments || []).map((att) => {
                                            const isRemoved = editRemovedIds.includes(att.id);
                                            return (
                                                <div key={att.id} className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] ${isRemoved ? "bg-red-50" : "bg-blue-50"}`}>
                                                    <span className={`truncate flex-1 ${isRemoved ? "text-red-400 line-through" : "text-blue-600"}`}>{att.fileName}</span>
                                                    <span className={`shrink-0 ${isRemoved ? "text-red-300" : "text-blue-300"}`}>{formatFileSize(att.size)}</span>
                                                    <button
                                                        onClick={() => setEditRemovedIds(prev => isRemoved ? prev.filter(id => id !== att.id) : [...prev, att.id])}
                                                        className={`shrink-0 ml-0.5 ${isRemoved ? "text-blue-400 hover:text-blue-600" : "text-gray-300 hover:text-red-500"}`}
                                                        title={isRemoved ? "削除を取り消す" : "削除"}
                                                    >
                                                        {isRemoved ? "↩" : "✕"}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {editNewFiles.map((file, idx) => (
                                            <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 rounded text-[10px]">
                                                <span className="text-green-600 truncate flex-1">{file.name}</span>
                                                <span className="text-green-300 shrink-0">{formatFileSize(file.size)}</span>
                                                <button onClick={() => removeEditNewFile(idx)} className="text-green-400 hover:text-red-500 ml-1">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2 rounded-b-2xl">
                            <button className="btn-secondary text-xs py-1.5 px-4" onClick={handleCancelEdit} disabled={editUploading}>キャンセル</button>
                            <button className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5" onClick={handleSaveEdit} disabled={editUploading}>
                                {editUploading ? (
                                    <>
                                        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        アップロード中...
                                    </>
                                ) : "保存する"}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
