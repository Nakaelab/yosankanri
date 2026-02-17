"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
    ExtractedData, ExpenseCategory, CATEGORY_LABELS, ALL_CATEGORIES,
    DOC_TYPE_LABELS, DocType, validateExtracted,
} from "@/lib/types";
import { extractFromOCRText } from "@/lib/extract";
import { saveTransactionAction, getBudgetsAction } from "@/app/actions";
import { getCurrentTeacherId } from "@/lib/storage";
import { saveAttachment, fileToArrayBuffer } from "@/lib/attachments";
import type { Budget } from "@/lib/types";

type Mode = "ocr" | "manual";
type OCRStatus = "idle" | "loading" | "processing" | "done" | "error";

/** 見積書プレビュー用 */
interface EstimateFile {
    file: File;
    previewUrl: string;
}

export default function ImportPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const estimateInputRef = useRef<HTMLInputElement>(null);

    const [mode, setMode] = useState<Mode>("manual");
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [selectedBudgetId, setSelectedBudgetId] = useState("");

    // OCR state
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [ocrStatus, setOcrStatus] = useState<OCRStatus>("idle");
    const [ocrProgress, setOcrProgress] = useState(0);
    const [ocrProgressLabel, setOcrProgressLabel] = useState("");
    const [ocrRawText, setOcrRawText] = useState("");

    // Form fields (shared by both modes)
    const [slipNumber, setSlipNumber] = useState("");
    const [date, setDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    const [itemName, setItemName] = useState("");
    const [specification, setSpecification] = useState("");
    const [payee, setPayee] = useState("");
    const [unitPrice, setUnitPrice] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [amount, setAmount] = useState(0);
    const [category, setCategory] = useState<ExpenseCategory>("goods");

    // Estimates (見積書)
    const [estimates, setEstimates] = useState<EstimateFile[]>([]);

    // Validation
    const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        const load = async () => {
            const tid = getCurrentTeacherId();
            const currentTeacherId = tid === "default" ? undefined : tid;
            const data = await getBudgetsAction(currentTeacherId || undefined);
            setBudgets(data);
        };
        load();
    }, []);

    // ---- Auto-calc amount ----
    useEffect(() => {
        if (unitPrice > 0 && quantity > 0) {
            setAmount(unitPrice * quantity);
        }
    }, [unitPrice, quantity]);

    const validate = () => {
        const errs: { field: string; message: string }[] = [];
        if (!itemName.trim()) errs.push({ field: "itemName", message: "品名が空です" });
        if (amount <= 0) errs.push({ field: "amount", message: "金額が0以下です" });
        if (!date) errs.push({ field: "date", message: "日付が空です" });
        setErrors(errs);
        return errs;
    };

    // ---- File upload (OCR) ----
    const handleFile = useCallback((file: File) => {
        if (!file.type.startsWith("image/")) { alert("画像ファイルを選択してください"); return; }
        setImageFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setImagePreview(e.target?.result as string);
        reader.readAsDataURL(file);
        setOcrStatus("idle");
        setOcrRawText("");
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
    const handleDragLeave = () => setDragging(false);
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    // ---- OCR ----
    const runOCR = async () => {
        if (!imageFile) return;
        setOcrStatus("loading");
        setOcrProgress(0);
        setOcrProgressLabel("OCRエンジンを準備中...");

        try {
            const Tesseract = await import("tesseract.js");
            setOcrProgressLabel("日本語モデルをダウンロード中（初回は数十秒かかります）...");
            const result = await Tesseract.recognize(imageFile, "jpn", {
                logger: (m: { status: string; progress: number }) => {
                    if (m.status === "recognizing text") {
                        setOcrStatus("processing");
                        setOcrProgress(Math.round(m.progress * 100));
                        setOcrProgressLabel("文字認識中...");
                    } else if (m.status === "loading language traineddata") {
                        setOcrProgress(Math.round(m.progress * 100));
                        setOcrProgressLabel("日本語モデルをダウンロード中...");
                    } else {
                        setOcrProgressLabel(m.status);
                    }
                },
            });

            const text = result.data.text;
            setOcrRawText(text);
            const data = extractFromOCRText(text);
            // Fill form fields from extraction
            setSlipNumber(data.slipNumber);
            setDate(data.date);
            setItemName(data.itemName);
            setSpecification(data.specification);
            setPayee(data.payee);
            setUnitPrice(data.unitPrice);
            setQuantity(data.quantity);
            setAmount(data.amount);
            setCategory(data.category);
            setOcrStatus("done");
        } catch (err) {
            console.error("OCR Error:", err);
            setOcrStatus("error");
            setOcrProgressLabel("OCRエラーが発生しました");
        }
    };

    // ---- Estimate attachments ----
    const handleEstimateAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const newEstimates: EstimateFile[] = [];
        Array.from(files).forEach((file) => {
            if (file.type.startsWith("image/") || file.type === "application/pdf") {
                newEstimates.push({ file, previewUrl: URL.createObjectURL(file) });
            }
        });
        setEstimates((prev) => [...prev, ...newEstimates]);
        // Reset input
        if (estimateInputRef.current) estimateInputRef.current.value = "";
    };

    const removeEstimate = (index: number) => {
        setEstimates((prev) => {
            const next = [...prev];
            URL.revokeObjectURL(next[index].previewUrl);
            next.splice(index, 1);
            return next;
        });
    };

    // ---- Save ----
    // ---- Save ----
    const handleSave = async () => {
        if (!selectedBudgetId) { alert("予算（研究費）を選択してください"); return; }
        const errs = validate();
        if (errs.length > 0) {
            const proceed = confirm(
                "以下の項目に問題があります：\n" + errs.map((v) => `• ${v.message}`).join("\n") + "\n\nこのまま保存しますか？"
            );
            if (!proceed) return;
        }

        const txId = uuidv4();
        const tid = getCurrentTeacherId();
        const teacherId = tid === "default" ? undefined : tid;

        // Save attachments to IndexedDB
        for (const est of estimates) {
            const buffer = await fileToArrayBuffer(est.file);
            await saveAttachment({
                id: uuidv4(),
                transactionId: txId,
                fileName: est.file.name,
                mimeType: est.file.type,
                size: est.file.size,
                data: buffer,
                createdAt: new Date().toISOString(),
            });
        }

        await saveTransactionAction({
            id: txId,
            teacherId: teacherId || undefined,
            budgetId: selectedBudgetId,
            slipNumber,
            date,
            itemName,
            specification,
            payee,
            unitPrice,
            quantity,
            amount,
            category,
            attachmentCount: estimates.length,
            ocrRawText: mode === "ocr" ? ocrRawText : undefined,
            createdAt: new Date().toISOString(),
        });

        router.push("/transactions");
    };

    // ---- Reset ----
    // ... existing imports ...

    const resetForm = () => {
        setSlipNumber(""); setItemName(""); setSpecification(""); setPayee("");
        setUnitPrice(0); setQuantity(1); setAmount(0); setCategory(mode === "labor" ? "labor" : "goods");
        setEstimates([]); setErrors([]);
        setImageFile(null); setImagePreview(null); setOcrStatus("idle"); setOcrRawText("");
        const d = new Date();
        setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    };

    // Update category when mode changes
    useEffect(() => {
        if (mode === "labor") {
            setCategory("labor");
        } else if (mode === "manual") {
            setCategory("goods");
        }
    }, [mode]);

    const hasError = (field: string) => errors.some((e) => e.field === field);
    const getError = (field: string) => errors.find((e) => e.field === field)?.message;
    const showForm = mode === "manual" || mode === "labor" || (mode === "ocr" && ocrStatus === "done");

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">執行登録</h1>
                <p className="page-subtitle">手入力またはOCRで執行を登録</p>
            </div>

            <div className="p-6 space-y-5 max-w-4xl">
                {/* Mode Tabs */}
                <div className="flex bg-slate-100 rounded-lg p-1 w-fit gap-1">
                    <button
                        onClick={() => { setMode("manual"); }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === "manual" ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            }`}
                    >
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                            手入力 (物品等)
                        </span>
                    </button>
                    <button
                        onClick={() => { setMode("labor"); }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === "labor" ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            }`}
                    >
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                            </svg>
                            人件費登録
                        </span>
                    </button>
                    <button
                        onClick={() => { setMode("ocr"); }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === "ocr" ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                            }`}
                    >
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                            </svg>
                            OCR取り込み
                        </span>
                    </button>
                </div>

                {/* OCR Section */}
                {mode === "ocr" && ocrStatus !== "done" && (
                    <div className="section-card p-5 space-y-4">
                        <h2 className="text-sm font-bold text-gray-900">画像アップロード & OCR</h2>
                        <div
                            className={`upload-zone ${dragging ? "dragging" : ""}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                            {imagePreview ? (
                                <div className="space-y-3">
                                    <img src={imagePreview} alt="preview" className="max-h-48 mx-auto rounded-lg shadow" />
                                    <p className="text-xs text-gray-400">{imageFile?.name} — クリックで変更</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                                    </svg>
                                    <p className="text-sm font-medium text-gray-500">ドラッグ＆ドロップまたはクリック</p>
                                    <p className="text-xs text-gray-400">書類のスクリーンショットをアップロード</p>
                                </div>
                            )}
                        </div>
                        {imageFile && (
                            <div className="space-y-2">
                                <button className="btn-primary" onClick={runOCR} disabled={ocrStatus === "loading" || ocrStatus === "processing"}>
                                    {ocrStatus === "loading" || ocrStatus === "processing" ? (
                                        <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>処理中...</>
                                    ) : "OCRを実行"}
                                </button>
                                {(ocrStatus === "loading" || ocrStatus === "processing") && (
                                    <div className="space-y-1.5">
                                        <div className="progress-bar"><div className="progress-fill bg-brand-500" style={{ width: `${ocrProgress}%` }} /></div>
                                        <p className="text-xs text-gray-500">{ocrProgressLabel}</p>
                                    </div>
                                )}
                                {ocrStatus === "error" && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">OCRエラーが発生しました</div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Form (Manual or after OCR) */}
                {showForm && (
                    <div className="section-card p-5 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-gray-900">
                                {mode === "ocr" ? "抽出結果の確認・修正" : mode === "labor" ? "人件費情報の入力" : "執行情報の入力"}
                            </h2>
                            {errors.length > 0 && <span className="badge-error">{errors.length}件の確認事項</span>}
                        </div>

                        {/* Budget Selection */}
                        <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
                            <label className="form-label text-brand-700">予算（研究費）を選択 *</label>
                            <select className="form-select mt-1" value={selectedBudgetId} onChange={(e) => setSelectedBudgetId(e.target.value)}>
                                <option value="">-- 選択してください --</option>
                                {budgets.map((b) => (
                                    <option key={b.id} value={b.id}>{b.name} {b.jCode ? `(${b.jCode})` : ""}</option>
                                ))}
                            </select>
                        </div>

                        {/* Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="form-label">伝票番号</label>
                                <input type="text" className="form-input font-mono" value={slipNumber} onChange={(e) => setSlipNumber(e.target.value)} placeholder="例: P250000026-001" />
                            </div>
                            <div>
                                <label className="form-label">費目カテゴリ</label>
                                <select
                                    className="form-select"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                                    disabled={mode === "labor"} // Lock in labor mode
                                >
                                    {ALL_CATEGORIES.map((cat) => (<option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">{mode === "labor" ? "支払日 / 計上日" : "納品日"}</label>
                                <input type="date" className={`form-input ${hasError("date") ? "field-error" : ""}`} value={date} onChange={(e) => setDate(e.target.value)} />
                                {hasError("date") && <p className="field-error-text">{getError("date")}</p>}
                            </div>
                            <div>
                                <label className="form-label">{mode === "labor" ? "内容・期間 *" : "品名 *"}</label>
                                <input
                                    type="text"
                                    className={`form-input ${hasError("itemName") ? "field-error" : ""}`}
                                    value={itemName}
                                    onChange={(e) => setItemName(e.target.value)}
                                    placeholder={mode === "labor" ? "例: 人件費試算額(6月～3月)" : "例: 電源タップ"}
                                />
                                {hasError("itemName") && <p className="field-error-text">{getError("itemName")}</p>}
                            </div>
                            <div>
                                <label className="form-label">{mode === "labor" ? "対象者名" : "規格等"}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={specification}
                                    onChange={(e) => setSpecification(e.target.value)}
                                    placeholder={mode === "labor" ? "例: 山田 太郎" : "例: エレコム 10個口 2m"}
                                />
                            </div>
                            {mode !== "labor" && (
                                <div>
                                    <label className="form-label">支払先</label>
                                    <input type="text" className="form-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="例: 法人カード / Amazon" />
                                </div>
                            )}
                            <div>
                                <label className="form-label">{mode === "labor" ? "支給額 (単価)" : "単価"}</label>
                                <input type="number" className="form-input" value={unitPrice || ""} onChange={(e) => setUnitPrice(parseInt(e.target.value, 10) || 0)} min={0} placeholder="0" />
                            </div>
                            <div>
                                <label className="form-label">{mode === "labor" ? "支給回数 (数量)" : "数量"}</label>
                                <input type="number" className="form-input" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)} min={1} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="form-label">金額（円）*</label>
                                <input
                                    type="number"
                                    className={`form-input text-lg font-bold ${hasError("amount") ? "field-error" : ""}`}
                                    value={amount || ""}
                                    onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
                                    min={0}
                                    placeholder="0"
                                />
                                {hasError("amount") && <p className="field-error-text">{getError("amount")}</p>}
                                {unitPrice > 0 && quantity > 1 && (
                                    <p className="text-[11px] text-gray-400 mt-1">単価 {unitPrice.toLocaleString()} × 数量 {quantity} = {(unitPrice * quantity).toLocaleString()}</p>
                                )}
                            </div>
                        </div>

                        {/* Estimate Attachments (見積書) */}
                        <div className="border-t border-gray-100 pt-5">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                        </svg>
                                        {mode === "labor" ? "関連書類・メモ" : "見積書・添付ファイル"}
                                    </h3>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                        {mode === "labor" ? "雇用契約書や計算メモなどを添付できます（任意）" : "見積書や関連書類の画像を添付できます（任意）"}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="btn-secondary text-xs"
                                    onClick={() => estimateInputRef.current?.click()}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    ファイル追加
                                </button>
                                <input
                                    ref={estimateInputRef}
                                    type="file"
                                    accept="image/*,.pdf"
                                    multiple
                                    className="hidden"
                                    onChange={handleEstimateAdd}
                                />
                            </div>

                            {estimates.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {estimates.map((est, i) => (
                                        <div key={i} className="relative group rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                                            {est.file.type.startsWith("image/") ? (
                                                <img src={est.previewUrl} alt={est.file.name} className="w-full h-28 object-cover" />
                                            ) : (
                                                <div className="w-full h-28 flex items-center justify-center">
                                                    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                                    </svg>
                                                </div>
                                            )}
                                            <div className="px-2 py-1.5 border-t border-gray-200">
                                                <p className="text-[10px] text-gray-500 truncate">{est.file.name}</p>
                                                <p className="text-[9px] text-gray-400">{(est.file.size / 1024).toFixed(0)}KB</p>
                                            </div>
                                            <button
                                                onClick={() => removeEstimate(i)}
                                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center
                                   opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-300 transition-colors"
                                    onClick={() => estimateInputRef.current?.click()}>
                                    <svg className="w-8 h-8 mx-auto text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                    </svg>
                                    <p className="text-xs text-gray-400">ファイルをここに追加（任意）</p>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                            <button className="btn-primary" onClick={handleSave}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
                                </svg>
                                保存して執行一覧へ
                            </button>
                            <button className="btn-secondary" onClick={resetForm}>クリア</button>
                            {estimates.length > 0 && (
                                <span className="text-[11px] text-gray-400 ml-auto">ファイル {estimates.length}件添付</span>
                            )}
                        </div>
                    </div>
                )}
// ... existing ocr raw text render ...

                {/* OCR Raw Text */}
                {ocrRawText && (
                    <details className="section-card">
                        <summary className="px-5 py-3 cursor-pointer text-xs font-medium text-gray-500 hover:bg-gray-50">OCR全文（デバッグ用）</summary>
                        <div className="px-5 pb-4">
                            <pre className="bg-slate-50 rounded-lg p-3 text-[11px] text-gray-600 whitespace-pre-wrap font-mono max-h-72 overflow-y-auto">{ocrRawText}</pre>
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}
