"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { v4 as uuidv4 } from "uuid";
import { Transaction, CATEGORY_LABELS, CATEGORY_COLORS, Budget, AttachmentMeta, ALL_CATEGORIES, ExpenseCategory } from "@/lib/types";
import { getTransactions, deleteTransaction, deleteTransactionsBySplitGroup, getBudgets, saveTransaction } from "@/lib/storage";
import { getCurrentTeacherId } from "@/lib/storage";
import { formatFileSize } from "@/lib/attachments";

// ===== 型定義 =====

/** 配分行（予算ID + 金額） */
interface SplitRow {
    key: string;       // UI用ユニークキー
    budgetId: string;
    amount: number;
}

/** 編集フォームの基本情報（予算・金額以外） */
interface EditBase {
    slipNumber: string;
    orderDate: string;
    date: string;
    itemName: string;
    specification: string;
    payee: string;
    unitPrice: number;
    quantity: number;
    category: ExpenseCategory;
    status?: "provisional" | "confirmed";
    memo?: string;
}

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [filterBudgetId, setFilterBudgetId] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "all">("all");
    const [mounted, setMounted] = useState(false);

    // Attachment preview
    const [previewTx, setPreviewTx] = useState<Transaction | null>(null);
    const [previewAttachments, setPreviewAttachments] = useState<AttachmentMeta[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState("");

    // Edit modal
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);  // 代表トランザクション
    const [editBase, setEditBase] = useState<EditBase>({
        slipNumber: "", orderDate: "", date: "", itemName: "", specification: "", payee: "",
        unitPrice: 0, quantity: 1, category: "goods", memo: ""
    });
    // 複数予算配分行
    const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
    // 添付ファイル
    const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
    const [editRemovedIds, setEditRemovedIds] = useState<string[]>([]);
    const [editUploading, setEditUploading] = useState(false);
    const editFileInputRef = useRef<HTMLInputElement>(null);

    const reload = () => {
        setTransactions(getTransactions().sort((a, b) => {
            // 人件費を最上位に固定
            const aIsLabor = a.category === "labor" ? 0 : 1;
            const bIsLabor = b.category === "labor" ? 0 : 1;
            if (aIsLabor !== bIsLabor) return aIsLabor - bIsLabor;

            if (aIsLabor === 0) {
                // まずは計上日（新しい順）
                if (a.date !== b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();

                // 同じ日の場合は、対象者名でグループ化（五十音順）
                const aPayee = a.specification || a.payee || "";
                const bPayee = b.specification || b.payee || "";
                if (aPayee !== bPayee) return aPayee.localeCompare(bPayee, "ja");

                // 同じ対象者なら、本体が上、消費税が下
                const aIsTax = a.itemName.includes("消費税");
                const bIsTax = b.itemName.includes("消費税");
                if (aIsTax !== bIsTax) return aIsTax ? 1 : -1;

                // 対象者名が同じでどちらも本体/消費税の場合は登録日時が古い順(通常ありえないが念のため)
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            }

            // 人件費以外は登録日時の降順
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }));
        setBudgets(getBudgets());
    };

    useEffect(() => { setMounted(true); reload(); }, []);

    // ===== 削除 =====
    const handleDelete = (tx: Transaction) => {
        if (!confirm("この執行データを削除しますか？\n添付ファイルも削除されます。")) return;
        if (tx.splitGroupId) {
            // グループ全体を削除
            deleteTransactionsBySplitGroup(tx.splitGroupId);
        } else {
            deleteTransaction(tx.id);
        }
        reload();
    };

    // ===== 編集を開く =====
    const handleEdit = (tx: Transaction) => {
        // splitGroupId がある場合、グループ全件を取得して配分行を復元
        const allTxs = getTransactions();
        let groupTxs: Transaction[];
        if (tx.splitGroupId) {
            groupTxs = allTxs.filter(t => t.splitGroupId === tx.splitGroupId)
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        } else {
            groupTxs = [tx];
        }
        // 代表（最初の）トランザクション
        const rep = groupTxs[0];
        setEditingTx(rep);
        setEditNewFiles([]);
        setEditRemovedIds([]);
        setEditBase({
            slipNumber: rep.slipNumber,
            orderDate: rep.orderDate || "",
            date: rep.date,
            itemName: rep.itemName,
            specification: rep.specification,
            payee: rep.payee,
            unitPrice: rep.unitPrice,
            quantity: rep.quantity,
            category: rep.category,
            status: rep.status,
            memo: rep.memo || "",
        });
        setSplitRows(groupTxs.map(t => ({
            key: uuidv4(),
            budgetId: t.budgetId,
            amount: t.amount,
        })));
    };

    // ===== 配分行操作 =====
    const addSplitRow = () => setSplitRows(prev => [...prev, { key: uuidv4(), budgetId: "", amount: 0 }]);
    const removeSplitRow = (key: string) => setSplitRows(prev => prev.filter(r => r.key !== key));
    const updateSplitRow = (key: string, patch: Partial<SplitRow>) =>
        setSplitRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));

    // ===== 合計金額 =====
    const totalSplitAmount = splitRows.reduce((s, r) => s + (r.amount || 0), 0);

    // ===== 金額自動計算（非人件費） =====
    useEffect(() => {
        if (!editingTx) return;
        if (editBase.category !== "labor" && editBase.unitPrice > 0 && editBase.quantity > 0) {
            const auto = editBase.unitPrice * editBase.quantity;
            // 配分が1行のみなら金額を自動反映
            if (splitRows.length === 1) {
                setSplitRows(prev => prev.map((r, i) => i === 0 ? { ...r, amount: auto } : r));
            }
        }
    }, [editBase.unitPrice, editBase.quantity]);

    // ===== 保存 =====
    const handleSaveEdit = async () => {
        if (!editingTx) return;

        // バリデーション
        if (splitRows.length === 0) { alert("予算を1つ以上選択してください"); return; }
        for (const r of splitRows) {
            if (!r.budgetId) { alert("すべての予算行で予算を選択してください"); return; }
            if (r.amount <= 0) { alert("すべての予算行で金額を入力してください"); return; }
        }
        if (!editBase.itemName.trim()) { alert("品名を入力してください"); return; }

        setEditUploading(true);

        // 添付ファイルのアップロード（代表トランザクションに紐づける）
        const newMetas: AttachmentMeta[] = [];
        for (const file of editNewFiles) {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("transactionId", editingTx.id);
            try {
                const res = await fetch("/api/upload", { method: "POST", body: fd });
                if (res.ok) newMetas.push(await res.json());
                else alert(`アップロード失敗: ${file.name}`);
            } catch { alert(`アップロードエラー: ${file.name}`); }
        }
        const keptAttachments = (editingTx.attachments || []).filter(a => !editRemovedIds.includes(a.id));
        const allAttachments = [...keptAttachments, ...newMetas];

        // 既存トランザクション（グループ）を削除してから再保存
        if (editingTx.splitGroupId) {
            deleteTransactionsBySplitGroup(editingTx.splitGroupId);
        } else {
            deleteTransaction(editingTx.id);
        }

        const teacherId = getCurrentTeacherId() || undefined;
        const isMulti = splitRows.length > 1;
        const groupId = isMulti ? (editingTx.splitGroupId || uuidv4()) : undefined;
        const now = new Date().toISOString();

        splitRows.forEach((row, idx) => {
            const tx: Transaction = {
                id: idx === 0 ? editingTx.id : uuidv4(),
                teacherId,
                budgetId: row.budgetId,
                slipNumber: editBase.slipNumber,
                orderDate: editBase.orderDate || undefined,
                date: editBase.date,
                itemName: editBase.itemName,
                specification: editBase.specification,
                payee: editBase.payee,
                unitPrice: editBase.category === "labor" ? row.amount : editBase.unitPrice,
                quantity: editBase.category === "labor" ? 1 : editBase.quantity,
                amount: row.amount,
                category: editBase.category,
                status: editBase.status,
                memo: editBase.memo,
                attachmentCount: idx === 0 ? allAttachments.length : 0,
                attachments: idx === 0 && allAttachments.length > 0 ? allAttachments : undefined,
                ocrRawText: editingTx.ocrRawText,
                splitGroupId: groupId,
                createdAt: idx === 0 ? editingTx.createdAt : now,
            };
            saveTransaction(tx);
        });

        setEditUploading(false);
        setEditingTx(null);
        setEditNewFiles([]);
        setEditRemovedIds([]);
        reload();
    };

    const handleCancelEdit = () => { setEditingTx(null); setEditNewFiles([]); setEditRemovedIds([]); };

    const handleEditFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        setEditNewFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        if (editFileInputRef.current) editFileInputRef.current.value = "";
    };
    const removeEditNewFile = (idx: number) => setEditNewFiles(prev => prev.filter((_, i) => i !== idx));

    // ===== 添付プレビュー =====
    const openAttachments = (tx: Transaction) => {
        setPreviewTx(tx);
        const metas = tx.attachments || [];
        setPreviewAttachments(metas);
        if (metas.length > 0) showAttachment(metas[0]);
    };
    const showAttachment = (meta: AttachmentMeta) => { setPreviewUrl(meta.storageUrl || null); setPreviewName(meta.fileName); };
    const closePreview = () => { setPreviewTx(null); setPreviewAttachments([]); setPreviewUrl(null); setPreviewName(""); };

    // ===== ユーティリティ =====
    const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
    const getBudgetName = (id: string) => budgets.find((b) => b.id === id)?.name || "未割当";
    const isLabor = editBase.category === "labor";

    // 一覧表示用: splitGroupを考慮した表示行（グループの最初の行のみを代表として表示）
    const allTxs = transactions;
    const displayedTxIds = new Set<string>();
    const displayRows: Transaction[] = [];
    for (const tx of allTxs) {
        if (tx.splitGroupId) {
            if (!displayedTxIds.has(tx.splitGroupId)) {
                displayedTxIds.add(tx.splitGroupId);
                displayRows.push(tx);
            }
        } else {
            displayRows.push(tx);
        }
    }

    const filtered = displayRows.filter((t) => {
        // 予算フィルタ
        if (filterBudgetId !== "all") {
            if (t.splitGroupId) {
                const hasBudget = allTxs.some(at => at.splitGroupId === t.splitGroupId && at.budgetId === filterBudgetId);
                if (!hasBudget) return false;
            } else {
                if (t.budgetId !== filterBudgetId) return false;
            }
        }

        // カテゴリフィルタ
        if (filterCategory !== "all" && t.category !== filterCategory) return false;

        // 検索ワードフィルタ
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            const groupTxs = t.splitGroupId ? allTxs.filter(at => at.splitGroupId === t.splitGroupId) : [t];
            const groupText = groupTxs.map(tx => [
                tx.itemName, tx.payee, tx.specification, tx.slipNumber, getBudgetName(tx.budgetId)
            ].join(" ")).join(" ").toLowerCase();

            if (!groupText.includes(q)) return false;
        }

        return true;
    });

    const filteredTotal = allTxs.filter(t => {
        // 代表行がfilteredに残っているか
        const rep = t.splitGroupId ? filtered.find(f => f.splitGroupId === t.splitGroupId) : filtered.find(f => f.id === t.id);
        if (!rep) return false;
        // 予算が指定されている場合は、その予算の分だけを合計する
        if (filterBudgetId !== "all" && t.budgetId !== filterBudgetId) return false;
        return true;
    }).reduce((s, t) => s + t.amount, 0);

    let totalAllocated = 0;
    let totalSpent = 0;
    let totalRemaining = 0;
    const activeStats: { category: ExpenseCategory; allocated: number; spent: number; remaining: number }[] = [];

    if (filterBudgetId === "all") {
        totalAllocated = budgets.reduce((acc, b) => acc + ALL_CATEGORIES.reduce((s, cat) => s + (b.allocations[cat] || 0), 0), 0);
        totalSpent = allTxs.reduce((s, t) => s + t.amount, 0);
        totalRemaining = totalAllocated - totalSpent;

        ALL_CATEGORIES.forEach(cat => {
            const allocated = budgets.reduce((acc, b) => acc + (b.allocations[cat] || 0), 0);
            const spent = allTxs.filter(t => t.category === cat).reduce((s, t) => s + t.amount, 0);
            const remaining = allocated - spent;
            if (allocated > 0 || spent > 0) {
                activeStats.push({ category: cat, allocated, spent, remaining });
            }
        });
    } else {
        const selectedBudget = budgets.find(b => b.id === filterBudgetId);
        if (selectedBudget) {
            totalAllocated = ALL_CATEGORIES.reduce((s, cat) => s + (selectedBudget.allocations[cat] || 0), 0);
            totalSpent = allTxs.filter(t => t.budgetId === filterBudgetId).reduce((s, t) => s + t.amount, 0);
            totalRemaining = totalAllocated - totalSpent;

            ALL_CATEGORIES.forEach(cat => {
                const allocated = selectedBudget.allocations[cat] || 0;
                const spent = allTxs.filter(t => t.budgetId === filterBudgetId && t.category === cat).reduce((s, t) => s + t.amount, 0);
                const remaining = allocated - spent;
                if (allocated > 0 || spent > 0) {
                    activeStats.push({ category: cat, allocated, spent, remaining });
                }
            });
        }
    }

    // トランザクションの予算名表示（複数の場合は「分割」と表示）
    const getTxBudgetDisplay = (tx: Transaction) => {
        if (!tx.splitGroupId) return getBudgetName(tx.budgetId);
        const group = allTxs.filter(t => t.splitGroupId === tx.splitGroupId);
        if (group.length <= 1) return getBudgetName(tx.budgetId);
        const names = [...new Set(group.map(t => getBudgetName(t.budgetId)))];
        return `${names[0]}他${names.length - 1}件`;
    };

    // トランザクションの合計金額（グループ全体）
    const getTxTotalAmount = (tx: Transaction) => {
        if (!tx.splitGroupId) return tx.amount;
        return allTxs.filter(t => t.splitGroupId === tx.splitGroupId).reduce((s, t) => s + t.amount, 0);
    };

    if (!mounted) return <div className="flex items-center justify-center h-screen"><div className="text-gray-400 text-sm">読み込み中...</div></div>;

    return (
        <div className="animate-fade-in">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">執行一覧</h1>
                    <p className="page-subtitle">全支出明細</p>
                </div>
            </div>

            {/* Status & Options Panel */}
            <div className="mt-5 bg-white border border-gray-100 rounded-xl p-4 md:p-5 shadow-sm space-y-5">

                {/* 1. Status Dashboard */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex gap-4 sm:gap-8 text-left">
                        <div>
                            <div className="text-[11px] text-gray-400 uppercase font-bold tracking-widest mb-1">配分総額</div>
                            <div className="text-2xl sm:text-3xl font-bold tabular-nums text-gray-900">{fmt(totalAllocated)}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-400 uppercase font-bold tracking-widest mb-1">執行済</div>
                            <div className="text-2xl sm:text-3xl font-bold tabular-nums text-brand-600">{fmt(totalSpent)}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-400 uppercase font-bold tracking-widest mb-1">残額</div>
                            <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${totalRemaining < 0 ? "text-red-600" : "text-emerald-500"}`}>
                                {fmt(totalRemaining)}
                            </div>
                        </div>
                    </div>

                    {(filterBudgetId !== "all" || filterCategory !== "all" || searchTerm.trim()) && (
                        <div className="text-left md:text-right px-5 py-3 bg-gray-50 rounded-xl border border-gray-100 shrink-0">
                            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-0.5">フィルター表示中の合計</div>
                            <div className="text-lg font-bold tabular-nums text-gray-900">{fmt(filteredTotal)}</div>
                        </div>
                    )}
                </div>

                {/* 2. Category Breakdown */}
                {activeStats.length > 0 && (
                    <div className="pt-5 border-t border-gray-100 overflow-x-auto">
                        <div className="flex gap-3 min-w-max pb-2">
                            {activeStats.map(s => {
                                const colors = CATEGORY_COLORS[s.category];
                                return (
                                    <div key={s.category} className="flex flex-col min-w-[140px] bg-slate-50/70 rounded-lg p-3 border border-slate-100 shadow-sm transition-all hover:bg-slate-50">
                                        <div className={`flex items-center gap-1.5 text-xs font-bold mb-2.5 ${colors.text}`}>
                                            <span className={`w-2.5 h-2.5 rounded-full ${colors.bar}`} />
                                            {CATEGORY_LABELS[s.category]}
                                        </div>
                                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
                                            <span className="text-gray-400 font-medium">配分</span>
                                            <span className="text-right text-gray-900 font-semibold">{fmt(s.allocated)}</span>
                                            <span className="text-gray-400 font-medium">執行</span>
                                            <span className="text-right text-gray-900 font-bold">{fmt(s.spent)}</span>
                                            <span className="text-gray-400 font-medium">残額</span>
                                            <span className={`text-right font-bold ${s.remaining < 0 ? "text-red-500" : "text-emerald-600"}`}>{fmt(s.remaining)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 3. Filters & Search */}
                <div className="pt-5 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                    {/* Budget Selector (Primary) */}
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
                            予算で絞り込む
                        </label>
                        <select
                            className="w-full bg-slate-50 border border-gray-200 text-sm py-2 px-3 rounded-lg font-medium text-gray-800 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
                            value={filterBudgetId}
                            onChange={(e) => setFilterBudgetId(e.target.value)}
                        >
                            <option value="all">すべての予算 ({displayRows.length}件)</option>
                            {budgets.map((b) => <option key={b.id} value={b.id}>{b.name} ({allTxs.filter((t) => t.budgetId === b.id).length}件)</option>)}
                        </select>
                    </div>

                    {/* Category Selector */}
                    <div className="w-full sm:w-48 shrink-0">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
                            費目で絞り込む
                        </label>
                        <select
                            className="w-full bg-white border border-gray-200 text-sm py-2 px-3 rounded-lg focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 transition-all outline-none text-gray-700"
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value as ExpenseCategory | "all")}
                        >
                            <option value="all">すべての費目</option>
                            {ALL_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                            ))}
                        </select>
                    </div>

                    {/* Search Bar */}
                    <div className="w-full sm:w-64 shrink-0">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
                            キーワード検索
                        </label>
                        <div className="relative">
                            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="品名や支払先で検索..."
                                className="w-full bg-white border border-gray-200 text-sm py-2 pl-9 pr-3 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none placeholder:text-gray-300"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
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
                                        <th>No.</th><th>発注日</th><th>納品日</th><th>品名</th><th>規格等</th><th>支払先</th>
                                        <th className="text-right">単価</th><th className="text-center">数量</th>
                                        <th className="text-right">金額</th><th>費目</th><th>予算</th>
                                        <th className="text-center">📎</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((tx) => {
                                        const colors = CATEGORY_COLORS[tx.category];
                                        const isSplit = !!(tx.splitGroupId && allTxs.filter(t => t.splitGroupId === tx.splitGroupId).length > 1);
                                        const totalAmt = getTxTotalAmount(tx);

                                        const isLabor = tx.category === "labor";
                                        const isTax = isLabor && tx.itemName.includes("消費税");
                                        let rowClass = "hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0";
                                        if (isLabor) {
                                            rowClass = isTax ? "bg-slate-50/60 hover:bg-slate-100 border-b border-gray-100 last:border-0" : "bg-indigo-50/30 hover:bg-indigo-50/60 border-b border-gray-100 last:border-0";
                                        }

                                        return (
                                            <tr key={tx.id} className={rowClass}>
                                                <td className="font-mono text-[11px] text-gray-500 whitespace-nowrap">{tx.slipNumber || "—"}</td>
                                                <td className="whitespace-nowrap text-[12px] text-gray-400">{tx.orderDate || "—"}</td>
                                                <td className="whitespace-nowrap text-[12px]">{tx.date}</td>
                                                <td className={`font-medium max-w-[180px] truncate ${isTax ? "text-gray-500 font-normal" : "text-gray-900"}`}>
                                                    {isTax && <span className="text-gray-400 mr-1.5 text-[10px]">↳</span>}
                                                    {isLabor && tx.status === "provisional" && (
                                                        <span className="inline-block bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 border border-amber-200 align-text-bottom">仮</span>
                                                    )}
                                                    {tx.itemName || "—"}
                                                    {tx.memo && (
                                                        <p className="text-[10px] text-gray-400 font-normal mt-0.5 truncate" title={tx.memo}>
                                                            📝 {tx.memo}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="max-w-[140px] truncate text-gray-500 text-[12px]">{tx.specification || "—"}</td>
                                                <td className="text-[12px] text-gray-500">{tx.payee || "—"}</td>
                                                <td className={`text-right tabular-nums text-[12px] ${isTax ? "text-gray-500" : ""}`}>{tx.unitPrice > 0 ? tx.unitPrice.toLocaleString() : "—"}</td>
                                                <td className={`text-center tabular-nums text-[12px] ${isTax ? "text-gray-500" : ""}`}>{tx.quantity}</td>
                                                <td className={`text-right font-medium tabular-nums whitespace-nowrap ${isTax ? "text-gray-600" : ""}`}>
                                                    {fmt(totalAmt)}
                                                    {isSplit && <span className="ml-1 text-[9px] text-indigo-400 font-bold">分割</span>}
                                                </td>
                                                <td>
                                                    {isTax ? (
                                                        <span className="text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded bg-white">消費税</span>
                                                    ) : (
                                                        <span className={`badge ${colors.bg} ${colors.text}`}>{CATEGORY_LABELS[tx.category]}</span>
                                                    )}
                                                </td>
                                                <td className="text-[11px] text-gray-400 max-w-[120px] truncate">{getTxBudgetDisplay(tx)}</td>
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
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                                                        </button>
                                                        <button className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" onClick={() => handleDelete(tx)}>
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

            {/* ===== Attachment Preview Modal ===== */}
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

            {/* ===== Edit Modal ===== */}
            {editingTx && createPortal(
                <div
                    style={{ position: "fixed", inset: 0, zIndex: 9999, backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "1rem" }}
                    onClick={handleCancelEdit}
                >
                    <div
                        style={{ background: "white", borderRadius: "1rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)", width: "100%", maxWidth: "40rem", flexShrink: 0, marginTop: "1rem", marginBottom: "1rem" }}
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
                        <div className="px-4 py-3 space-y-3">

                            {/* 費目 & 状態(人件費のみ) */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">費目</label>
                                    <select className="form-select text-xs py-1" value={editBase.category} onChange={(e) => setEditBase({ ...editBase, category: e.target.value as ExpenseCategory })}>
                                        {ALL_CATEGORIES.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
                                    </select>
                                </div>
                                {isLabor && (
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">ステータス (仮/確)</label>
                                        <div className="flex rounded-md overflow-hidden border border-gray-200 text-xs font-semibold mt-1">
                                            <button
                                                type="button"
                                                onClick={() => setEditBase({ ...editBase, status: "provisional" })}
                                                className={`flex-1 py-1 transition-colors ${editBase.status === "provisional" ? "bg-amber-400 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                                            >仮</button>
                                            <button
                                                type="button"
                                                onClick={() => setEditBase({ ...editBase, status: "confirmed" })}
                                                className={`flex-1 py-1 transition-colors border-l border-gray-200 ${editBase.status === "confirmed" ? "bg-green-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                                            >確定</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 伝票 + 日付 */}
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">伝票番号</label>
                                    <input type="text" className="form-input font-mono text-xs py-1" value={editBase.slipNumber} onChange={(e) => setEditBase({ ...editBase, slipNumber: e.target.value })} placeholder="例: P250..." />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">発注日</label>
                                    <input type="date" className="form-input text-xs py-1" value={editBase.orderDate} onChange={(e) => setEditBase({ ...editBase, orderDate: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">{isLabor ? "支払日" : "納品日"}</label>
                                    <input type="date" className="form-input text-xs py-1" value={editBase.date} onChange={(e) => setEditBase({ ...editBase, date: e.target.value })} />
                                </div>
                            </div>

                            {/* 品名 */}
                            <div>
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">{isLabor ? "内容・期間" : "品名"}</label>
                                <input type="text" className="form-input text-xs py-1" value={editBase.itemName} onChange={(e) => setEditBase({ ...editBase, itemName: e.target.value })} />
                            </div>

                            {/* 規格 + 支払先 */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">{isLabor ? "対象者名" : "規格等"}</label>
                                    <input type="text" className="form-input text-xs py-1" value={editBase.specification} onChange={(e) => setEditBase({ ...editBase, specification: e.target.value })} />
                                </div>
                                {!isLabor && (
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">支払先</label>
                                        <input type="text" className="form-input text-xs py-1" value={editBase.payee} onChange={(e) => setEditBase({ ...editBase, payee: e.target.value })} />
                                    </div>
                                )}
                            </div>

                            {/* 単価 + 数量（非人件費） */}
                            {!isLabor && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">単価</label>
                                        <input type="number" className="form-input text-xs py-1" value={editBase.unitPrice || ""} onChange={(e) => setEditBase({ ...editBase, unitPrice: parseInt(e.target.value, 10) || 0 })} min={0} />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">数量</label>
                                        <input type="number" className="form-input text-xs py-1" value={editBase.quantity} onChange={(e) => setEditBase({ ...editBase, quantity: parseInt(e.target.value, 10) || 1 })} min={1} />
                                    </div>
                                </div>
                            )}

                            {/* 備考・メモ */}
                            <div>
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wide block mb-0.5">備考・メモ</label>
                                <input type="text" className="form-input text-xs py-1" value={editBase.memo || ""} onChange={(e) => setEditBase({ ...editBase, memo: e.target.value })} placeholder="特記事項など" />
                            </div>

                            {/* ===== 予算配分セクション ===== */}
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 space-y-2">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">予算配分</span>
                                    <button
                                        type="button"
                                        onClick={addSplitRow}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-[10px] font-bold rounded-lg transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                        予算を追加
                                    </button>
                                </div>

                                {splitRows.map((row, idx) => (
                                    <div key={row.key} className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                            {idx + 1}
                                        </div>
                                        <select
                                            className="form-select text-xs py-1 flex-1 min-w-0"
                                            value={row.budgetId}
                                            onChange={(e) => updateSplitRow(row.key, { budgetId: e.target.value })}
                                        >
                                            <option value="">-- 予算を選択 --</option>
                                            {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}{b.jCode ? ` (${b.jCode})` : ""}</option>)}
                                        </select>
                                        <div className="relative shrink-0 w-28">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">¥</span>
                                            <input
                                                type="number"
                                                className="form-input text-xs py-1 pl-5 w-full font-bold"
                                                value={row.amount || ""}
                                                onChange={(e) => updateSplitRow(row.key, { amount: parseInt(e.target.value, 10) || 0 })}
                                                min={0}
                                                placeholder="0"
                                            />
                                        </div>
                                        {splitRows.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeSplitRow(row.key)}
                                                className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 text-red-500 flex items-center justify-center shrink-0 transition-colors"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                                            </button>
                                        )}
                                    </div>
                                ))}

                                {/* 合計 */}
                                <div className="flex justify-between items-center pt-1.5 border-t border-indigo-100 mt-1">
                                    <span className="text-[10px] text-indigo-600 font-bold">合計金額</span>
                                    <span className="text-sm font-bold tabular-nums text-indigo-700">
                                        {fmt(totalSplitAmount)}
                                    </span>
                                </div>
                            </div>

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
