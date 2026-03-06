"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
    ExtractedData, ExpenseCategory, CATEGORY_LABELS, ALL_CATEGORIES, CATEGORY_COLORS,
    DOC_TYPE_LABELS, DocType, validateExtracted, Transaction,
} from "@/lib/types";
import { extractFromOCRText } from "@/lib/extract";
import { getCurrentTeacherId, saveTransaction, getBudgets, getTransactions } from "@/lib/storage";
import type { Budget } from "@/lib/types";

type Mode = "ocr" | "manual" | "labor";
type OCRStatus = "idle" | "loading" | "processing" | "done" | "error";
type LaborStatus = "provisional" | "confirmed";

/** 予算分割エントリ */
interface BudgetSplit {
    id: string;
    budgetId: string;
    amount: number; // この予算への割当金額
}

/** 人件費バッチ入力行 */
interface LaborRow {
    id: string;
    itemName: string;      // 品名（内容・期間）
    payee: string;         // 支払先（対象者名）
    unitPrice: number;     // 単価
    quantity: number;      // 数量
    amount: number;        // 金額
    status: LaborStatus;   // 仮/確
    memo?: string;         // メモ
}

const TAX_RATE = 0.10; // 消費税率 10%

function emptyLaborRow(): LaborRow {
    return {
        id: uuidv4(),
        itemName: "",
        payee: "",
        unitPrice: 0,
        quantity: 1,
        amount: 0,
        status: "provisional",
        memo: "",
    };
}

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
    const [selectedBudgetId, setSelectedBudgetId] = useState(""); // 後方互換 (laborモード用)
    const [budgetSplits, setBudgetSplits] = useState<BudgetSplit[]>([{ id: uuidv4(), budgetId: "", amount: 0 }]);

    // OCR state
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [ocrStatus, setOcrStatus] = useState<OCRStatus>("idle");
    const [ocrProgress, setOcrProgress] = useState(0);
    const [ocrProgressLabel, setOcrProgressLabel] = useState("");
    const [ocrRawText, setOcrRawText] = useState("");

    // Form fields (shared by both modes)
    const [slipNumber, setSlipNumber] = useState("");
    const [orderDate, setOrderDate] = useState("");
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
    const [memo, setMemo] = useState("");
    const [dateUnknown, setDateUnknown] = useState(false);

    // Estimates (見積書)
    const [estimates, setEstimates] = useState<EstimateFile[]>([]);

    // Labor batch rows
    const [laborRows, setLaborRows] = useState<LaborRow[]>([emptyLaborRow()]);
    const [laborBudgetId, setLaborBudgetId] = useState("");
    const [laborIncludeTax, setLaborIncludeTax] = useState(true);
    const [laborDate, setLaborDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });

    // Validation
    const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
    const [dragging, setDragging] = useState(false);

    // Existing transactions for editing
    const [existingTransactions, setExistingTransactions] = useState<Transaction[]>([]);
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [editForm, setEditForm] = useState({
        slipNumber: "",
        orderDate: "",
        date: "",
        itemName: "",
        specification: "",
        payee: "",
        unitPrice: 0,
        quantity: 1,
        amount: 0,
        category: "goods" as ExpenseCategory,
        budgetId: "",
        memo: "",
        status: "provisional" as "provisional" | "confirmed",
    });

    useEffect(() => {
        const load = () => {
            const bData = getBudgets();
            const txData = getTransactions();
            setBudgets(bData);
            setExistingTransactions(
                txData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            );
        };
        load();
    }, []);

    // ---- Auto-calc amount ----
    useEffect(() => {
        if (unitPrice > 0 && quantity > 0) {
            const computed = unitPrice * quantity;
            setAmount(computed);
            // 分割が1件だけなら金額を自動同期
            setBudgetSplits(prev => prev.length === 1 ? [{ ...prev[0], amount: computed }] : prev);
        }
    }, [unitPrice, quantity]);

    const validate = () => {
        const errs: { field: string; message: string }[] = [];
        if (!itemName.trim()) errs.push({ field: "itemName", message: "品名が空です" });
        if (amount <= 0) errs.push({ field: "amount", message: "金額が0以下です" });
        if (!date && !dateUnknown) errs.push({ field: "date", message: "日付が空です" });
        const validSplits = budgetSplits.filter(s => s.budgetId);
        if (validSplits.length === 0) errs.push({ field: "budgetSplits", message: "予算を1つ以上選択してください" });
        const splitTotal = validSplits.reduce((s, v) => s + v.amount, 0);
        if (amount > 0 && validSplits.length > 1 && splitTotal !== amount) {
            errs.push({ field: "budgetSplits", message: `予算の合計金額（¥${splitTotal.toLocaleString()}）が物品金額（¥${amount.toLocaleString()}）と一致しません` });
        }
        setErrors(errs);
        return errs;
    };

    // ---- Budget Splits helpers ----
    const addBudgetSplit = () => {
        setBudgetSplits(prev => [...prev, { id: uuidv4(), budgetId: "", amount: 0 }]);
    };

    const removeBudgetSplit = (id: string) => {
        setBudgetSplits(prev => prev.length <= 1 ? prev : prev.filter(s => s.id !== id));
    };

    const updateBudgetSplit = (id: string, field: keyof BudgetSplit, value: string | number) => {
        setBudgetSplits(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    /** 物品金額が入力されたとき、splitが1件だけなら金額を自動同期 */
    const syncSingleSplitAmount = (newAmount: number) => {
        setBudgetSplits(prev => {
            if (prev.length === 1) {
                return [{ ...prev[0], amount: newAmount }];
            }
            return prev;
        });
    };

    const splitTotal = budgetSplits.filter(s => s.budgetId).reduce((s, v) => s + v.amount, 0);
    const splitRemainder = amount - splitTotal;

    // ---- File upload (OCR/PDF) ----
    const handleFile = useCallback((file: File) => {
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") { alert("画像またはPDFファイルを選択してください"); return; }
        setImageFile(file);

        if (file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (e) => setImagePreview(e.target?.result as string);
            reader.readAsDataURL(file);
        } else {
            // PDFの場合はプレビュー画像を出さない（必要ならアイコンなどにする）
            setImagePreview("");
        }

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

    // ---- Paste (Ctrl+V) ----
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (mode !== "ocr") return;
            const files = Array.from(e.clipboardData?.files || []);
            const validFile = files.find(file =>
                file.type.startsWith("image/") ||
                file.type === "application/pdf" ||
                file.name.toLowerCase().endsWith(".pdf")
            );
            if (validFile) {
                handleFile(validFile);
            }
        };
        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, [mode, handleFile]);

    // ---- OCR / PDF Parse ----
    const runOCR = async () => {
        if (!imageFile) return;
        setOcrStatus("loading");
        setOcrProgress(0);

        try {
            let extractedText = "";

            if (imageFile.type === "application/pdf" || imageFile.name.toLowerCase().endsWith(".pdf")) {
                setOcrProgressLabel("PDFライブラリを準備中...");

                // Load pdfjs via webpack import, set local worker to avoid CDN issues
                let pdfjsLib: any;
                try {
                    pdfjsLib = await import("pdfjs-dist");
                    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
                } catch (importErr: any) {
                    throw new Error("pdfjsの読み込みに失敗: " + (importErr.message || String(importErr)));
                }

                setOcrProgressLabel("PDFを解析中...");
                const arrayBuffer = await imageFile.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                let pdfDoc: any;
                try {
                    pdfDoc = await pdfjsLib.getDocument({ data: uint8Array }).promise;
                } catch (loadErr: any) {
                    throw new Error("PDFの読み込みに失敗: " + (loadErr.message || String(loadErr)));
                }
                const numPages = pdfDoc.numPages;

                const Tesseract = await import("tesseract.js");

                for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                    setOcrProgressLabel(`\u30da\u30fc\u30b8 ${pageNum}/${numPages} \u3092\u5909\u63db\u4e2d...`);
                    setOcrProgress(Math.round(((pageNum - 1) / numPages) * 50));

                    const page = await pdfDoc.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 2.0 });

                    const canvas = document.createElement("canvas");
                    canvas.width = Math.round(viewport.width);
                    canvas.height = Math.round(viewport.height);
                    const ctx = canvas.getContext("2d");
                    if (!ctx) throw new Error("Canvas context\u306e\u53d6\u5f97\u306b\u5931\u6557");

                    await page.render({ canvasContext: ctx, viewport }).promise;

                    setOcrProgressLabel(`\u30da\u30fc\u30b8 ${pageNum}/${numPages} \u3092OCR\u4e2d...`);
                    setOcrStatus("processing");

                    const blob = await new Promise<Blob>((resolve, reject) =>
                        canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png")
                    );
                    const result = await Tesseract.recognize(blob, "jpn", {
                        logger: (m: { status: string; progress: number }) => {
                            if (m.status === "recognizing text") {
                                const base = ((pageNum - 1) / numPages) * 100;
                                setOcrProgress(Math.round(base + (m.progress * 100 / numPages)));
                            }
                        },
                    });
                    extractedText += result.data.text + "\n";
                }
                setOcrProgress(100);
            } else {
                setOcrProgressLabel("OCRエンジンを準備中...");
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
                extractedText = result.data.text;
            }

            setOcrRawText(extractedText);
            const data = extractFromOCRText(extractedText);
            // Fill form fields from extraction
            setSlipNumber(data.slipNumber);
            setOrderDate(data.orderDate || "");
            setDate(data.date);
            setItemName(data.itemName);
            setSpecification(data.specification);
            setPayee(data.payee);
            setUnitPrice(data.unitPrice);
            setQuantity(data.quantity);
            setAmount(data.amount);
            // 分割が1件だけなら金額を自動同期
            setBudgetSplits(prev => prev.length === 1 ? [{ ...prev[0], amount: data.amount }] : prev);
            setCategory(data.category);
            if (data.memo) setMemo(data.memo);
            setOcrStatus("done");
        } catch (err: any) {
            console.error("テキスト抽出エラー:", err);
            setOcrStatus("error");
            const msg = err?.message || String(err) || "不明なエラー";
            setOcrProgressLabel("失敗: " + msg);
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
    const handleSave = async () => {
        const errs = validate();
        const validSplits = budgetSplits.filter(s => s.budgetId);
        if (validSplits.length === 0) {
            alert("予算（研究費）を選択してください");
            return;
        }
        if (errs.length > 0) {
            const isSplitMismatch = errs.some(e => e.field === "budgetSplits" && e.message.includes("一致しません"));
            const proceed = confirm(
                "以下の項目に問題があります：\n" + errs.map((v) => `• ${v.message}`).join("\n") + "\n\nこのまま保存しますか？"
            );
            if (!proceed) return;
            if (isSplitMismatch) return; // 金額不一致は強制キャンセル
        }

        const tid = getCurrentTeacherId();
        const teacherId = tid === "default" ? undefined : tid;

        // 分割グループID（複数予算分割時に同一物品を識別）
        const splitGroupId = validSplits.length > 1 ? uuidv4() : undefined;

        // 先に最初のtransactionIDを決定してアップロードに使う
        const firstTxId = uuidv4();

        // Supabase Storage にアップロード
        const uploadedMeta: import("@/lib/types").AttachmentMeta[] = [];

        for (const est of estimates) {
            const fd = new FormData();
            fd.append("file", est.file);
            fd.append("transactionId", firstTxId);
            try {
                const res = await fetch("/api/upload", { method: "POST", body: fd });
                if (res.ok) {
                    const meta = await res.json();
                    uploadedMeta.push(meta);
                } else {
                    const errJson = await res.json().catch(() => ({}));
                    const errMsg = errJson.error || res.statusText;
                    console.error("Upload failed:", errMsg);
                    alert(`ファイルのアップロードに失敗しました: ${est.file.name}\n${errMsg}`);
                }
            } catch (e) {
                console.error("Upload exception:", e);
                alert(`ファイルのアップロードに失敗しました: ${est.file.name}\n${String(e)}`);
            }
        }

        // 各分割分を個別のTransactionとして保存
        validSplits.forEach((split, idx) => {
            const txId = idx === 0 ? firstTxId : uuidv4();
            // 分割の場合は各分割の金額を使用、単一の場合は通常の金額
            const txAmount = validSplits.length > 1 ? split.amount : amount;
            saveTransaction({
                id: txId,
                budgetId: split.budgetId,
                slipNumber,
                orderDate: orderDate || undefined,
                date: dateUnknown ? "未定" : date,
                itemName,
                specification,
                payee,
                unitPrice: validSplits.length > 1 ? split.amount : unitPrice,
                quantity: validSplits.length > 1 ? 1 : quantity,
                amount: txAmount,
                category,
                memo,
                attachmentCount: idx === 0 ? uploadedMeta.length : 0,
                attachments: idx === 0 && uploadedMeta.length > 0 ? uploadedMeta : undefined,
                ocrRawText: mode === "ocr" && idx === 0 ? ocrRawText : undefined,
                splitGroupId,
                createdAt: new Date().toISOString(),
            });
        });

        router.push("/transactions");
    };

    // ---- Labor batch helpers ----
    const updateLaborRow = (id: string, field: keyof LaborRow, value: string | number) => {
        setLaborRows(prev => prev.map(row => {
            if (row.id !== id) return row;
            return { ...row, [field]: value };
        }));
    };

    const addLaborRow = () => {
        setLaborRows(prev => [...prev, emptyLaborRow()]);
    };

    const removeLaborRow = (id: string) => {
        setLaborRows(prev => prev.length <= 1 ? prev : prev.filter(r => r.id !== id));
    };

    const laborSubtotal = laborRows.reduce((s, r) => s + r.amount, 0);
    const laborTax = laborIncludeTax ? Math.floor(laborSubtotal * TAX_RATE) : 0;
    const laborTotal = laborSubtotal + laborTax;

    const handleSaveLabor = async () => {
        if (!laborBudgetId) { alert("予算（研究費）を選択してください"); return; }
        const validRows = laborRows.filter(r => r.itemName.trim() && r.amount > 0);
        if (validRows.length === 0) { alert("少なくとも1行のデータを入力してください"); return; }

        const tid = getCurrentTeacherId();
        const teacherId = tid === "default" ? undefined : tid;

        for (const row of validRows) {
            const baseTxId = uuidv4();
            saveTransaction({
                id: baseTxId,
                budgetId: laborBudgetId,
                slipNumber: "",
                date: laborDate,
                itemName: row.itemName,
                specification: row.payee, // 対象者名
                payee: row.payee,
                unitPrice: row.amount,
                quantity: 1,
                amount: row.amount,
                category: "labor",
                status: row.status,
                memo: row.memo,
                attachmentCount: 0,
                createdAt: new Date().toISOString(),
            });

            // 各行ごとの消費税を個別に登録
            if (laborIncludeTax) {
                const taxAmount = Math.floor(row.amount * TAX_RATE);
                if (taxAmount > 0) {
                    saveTransaction({
                        id: uuidv4(),
                        budgetId: laborBudgetId,
                        slipNumber: "",
                        date: laborDate,
                        itemName: `消費税 (10%)`,
                        specification: row.payee, // 誰の消費税かわかるように対象者名をセット
                        payee: row.payee,
                        unitPrice: taxAmount,
                        quantity: 1,
                        amount: taxAmount,
                        category: "labor",
                        status: row.status,
                        memo: row.memo,
                        attachmentCount: 0,
                        // ソート時に本体のすぐ下に来るようにcreatedAtを少しだけ遅らせる
                        createdAt: new Date(Date.now() + 1).toISOString(),
                    });
                }
            }
        }

        router.push("/transactions");
    };

    // ---- Reset ----
    const resetForm = () => {
        setSlipNumber(""); setItemName(""); setSpecification(""); setPayee("");
        setUnitPrice(0); setQuantity(1); setAmount(0); setCategory(mode === "labor" ? "labor" : "goods");
        setMemo("");
        setEstimates([]); setErrors([]); setDateUnknown(false);
        setImageFile(null); setImagePreview(null); setOcrStatus("idle"); setOcrRawText("");
        setLaborRows([emptyLaborRow()]);
        setBudgetSplits([{ id: uuidv4(), budgetId: "", amount: 0 }]);
        const d = new Date();
        setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        setOrderDate("");
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

    // ---- Edit existing transaction ----
    const handleEditTx = (tx: Transaction) => {
        setEditingTx(tx);
        setEditForm({
            slipNumber: tx.slipNumber,
            orderDate: tx.orderDate || "",
            date: tx.date,
            itemName: tx.itemName,
            specification: tx.specification,
            payee: tx.payee,
            unitPrice: tx.unitPrice,
            quantity: tx.quantity,
            amount: tx.amount,
            category: tx.category,
            budgetId: tx.budgetId,
            memo: tx.memo || "",
            status: tx.status || "provisional",
        });
    };

    const handleSaveEdit = async () => {
        if (!editingTx) return;
        if (!editForm.budgetId) { alert("予算を選択してください"); return; }
        if (!editForm.itemName.trim()) { alert("品名を入力してください"); return; }
        if (editForm.amount <= 0) { alert("金額を確認してください"); return; }

        const updated: Transaction = {
            ...editingTx,
            ...editForm,
        };

        saveTransaction(updated);
        setEditingTx(null);
        // Refresh existing transactions
        const txData = getTransactions();
        setExistingTransactions(
            txData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        );
    };

    const handleCancelEdit = () => {
        setEditingTx(null);
    };

    // Auto-calc amount in edit form
    useEffect(() => {
        if (editingTx) {
            if (editForm.unitPrice > 0 && editForm.quantity > 0) {
                setEditForm(prev => ({ ...prev, amount: prev.unitPrice * prev.quantity }));
            }
        }
    }, [editForm.unitPrice, editForm.quantity]);

    const fmtYen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
    const getBudgetName = (id: string) => budgets.find(b => b.id === id)?.name || "未割当";

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">執行登録</h1>
                <p className="page-subtitle">手入力または書類読み取りで執行を登録</p>
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
                            OCR・テキスト抽出
                        </span>
                    </button>
                </div>

                {/* OCR Section */}
                {mode === "ocr" && ocrStatus !== "done" && (
                    <div className="section-card p-5 space-y-4">
                        <h2 className="text-sm font-bold text-gray-900">書類アップロード &amp; テキスト抽出</h2>
                        <div
                            className={`upload-zone flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:border-brand-500 bg-slate-50 hover:bg-brand-50/50"}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input ref={fileInputRef} type="file" accept=".pdf,image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={handleFileChange} />
                            {imageFile ? (
                                imageFile.type === "application/pdf" ? (
                                    <div className="flex flex-col items-center gap-2 p-4 text-slate-700">
                                        <svg className="w-16 h-16 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20ZM11.5 13H10V18H11.5V13ZM15.5 13H14V16H15.5C16.33 16 17 15.33 17 14.5C17 13.67 16.33 13 15.5 13ZM15.5 15H14.5V14H15.5V15ZM8.5 13H7V18H8.5C9.33 18 10 17.33 10 16.5V14.5C10 13.67 9.33 13 8.5 13ZM8.5 17H7.5V14H8.5V17Z" /></svg>
                                        <p className="font-medium text-sm text-center">{imageFile.name}</p>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setOcrStatus("idle"); setOcrRawText(""); }}
                                            className="text-white bg-red-500 hover:bg-red-600 rounded-md px-3 py-1 text-xs mt-2 transition-colors"
                                        >削除</button>
                                    </div>
                                ) : (
                                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                                        <img src={imagePreview!} alt="preview" className="max-h-96 w-full object-contain rounded-lg shadow-md" />
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setOcrStatus("idle"); setOcrRawText(""); }}
                                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-lg leading-none transition-colors"
                                            title="画像を削除"
                                        >✕</button>
                                        <p className="text-xs text-gray-400 mt-2 text-center">{imageFile?.name} — <button type="button" className="underline" onClick={() => fileInputRef.current?.click()}>クリックで変更</button></p>
                                    </div>
                                )
                            ) : (
                                <div className="space-y-2">
                                    <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                                    </svg>
                                    <p className="text-sm font-medium text-gray-500">ドラッグ＆ドロップ・クリック・貼り付け（Ctrl+V）</p>
                                    <p className="text-xs text-gray-400">書類のスクリーンショットをアップロード</p>
                                </div>
                            )}
                        </div>
                        {imageFile && (
                            <div className="space-y-2">
                                <button className="btn-primary" onClick={runOCR} disabled={ocrStatus === "loading" || ocrStatus === "processing"}>
                                    {ocrStatus === "loading" || ocrStatus === "processing" ? (
                                        <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>処理中...</>
                                    ) : imageFile.type === "application/pdf" || imageFile.name.toLowerCase().endsWith(".pdf") ? "テキストを抽出" : "OCRを実行"}
                                </button>
                                {(ocrStatus === "loading" || ocrStatus === "processing") && (
                                    <div className="space-y-1.5">
                                        <div className="progress-bar"><div className="progress-fill bg-brand-500" style={{ width: `${ocrProgress}%` }} /></div>
                                        <p className="text-xs text-gray-500">{ocrProgressLabel}</p>
                                    </div>
                                )}
                                {ocrStatus === "error" && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{ocrProgressLabel || "テキストの抽出に失敗しました"}</div>
                                )}
                                {ocrRawText && (ocrStatus as string) !== "done" && (
                                    <details open className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                        <summary className="text-xs font-medium text-amber-700 cursor-pointer">OCR読み取り結果（確認用）</summary>
                                        <pre className="mt-2 text-[10px] text-amber-900 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{ocrRawText}</pre>
                                    </details>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Labor Batch Form */}
                {mode === "labor" && (
                    <div className="section-card p-5 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                </svg>
                                人件費の一括登録
                            </h2>
                            <span className="text-[11px] text-gray-400">消費税 10% 自動計算</span>
                        </div>

                        {/* Budget & Date */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
                                <label className="form-label text-brand-700">予算（研究費）*</label>
                                <select className="form-select mt-1" value={laborBudgetId} onChange={(e) => setLaborBudgetId(e.target.value)}>
                                    <option value="">-- 選択してください --</option>
                                    {budgets.map((b) => (
                                        <option key={b.id} value={b.id}>{b.name} {b.jCode ? `(${b.jCode})` : ""}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">計上日</label>
                                <input type="date" className="form-input mt-1" value={laborDate} onChange={(e) => setLaborDate(e.target.value)} />
                            </div>
                        </div>

                        {/* Labor Rows */}
                        <div className="space-y-3">
                            {laborRows.map((row, idx) => (
                                <div key={row.id} className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:border-indigo-200 transition-colors bg-white">
                                    {/* Row header with index and delete */}
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-semibold text-gray-400">#{idx + 1}</span>
                                        <div className="flex items-center gap-2">
                                            <div className="flex rounded-md overflow-hidden border border-gray-200 text-xs font-semibold">
                                                <button
                                                    type="button"
                                                    onClick={() => updateLaborRow(row.id, "status", "provisional")}
                                                    className={`px-2.5 py-1 transition-colors ${row.status === "provisional" ? "bg-amber-400 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                                                >仮</button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateLaborRow(row.id, "status", "confirmed")}
                                                    className={`px-2.5 py-1 transition-colors border-l border-gray-200 ${row.status === "confirmed" ? "bg-green-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                                                >確定</button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeLaborRow(row.id)}
                                                className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                title="行を削除"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    {/* Fields */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">品名（内容・期間）</label>
                                            <input
                                                type="text"
                                                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition-all"
                                                value={row.itemName}
                                                onChange={(e) => updateLaborRow(row.id, "itemName", e.target.value)}
                                                placeholder="例: 人件費試算額(4月〜2月)"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">支払先</label>
                                            <input
                                                type="text"
                                                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition-all"
                                                value={row.payee}
                                                onChange={(e) => updateLaborRow(row.id, "payee", e.target.value)}
                                                placeholder="例: 岩田さん"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <div>
                                            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5">金額（総額）</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¥</span>
                                                <input
                                                    type="number"
                                                    className="w-full rounded-lg border border-gray-200 pl-7 pr-2.5 py-1.5 text-sm font-bold text-gray-800 tabular-nums focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition-all"
                                                    value={row.amount || ""}
                                                    onChange={(e) => updateLaborRow(row.id, "amount", parseInt(e.target.value, 10) || 0)}
                                                    min={0}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {/* 備考・メモ */}
                                    <div className="mt-2 text-right">
                                        <input
                                            type="text"
                                            className="w-full text-xs font-medium border-0 bg-gray-50/50 rounded-lg px-3 py-1.5 focus:ring-0 focus:bg-white transition-colors"
                                            placeholder="備考・メモ"
                                            value={row.memo || ""}
                                            onChange={(e) => updateLaborRow(row.id, "memo", e.target.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add row button */}
                        <button
                            type="button"
                            onClick={addLaborRow}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            行を追加
                        </button>

                        {/* Tax & Total Summary */}
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">人件費 小計</span>
                                    <span className="font-bold tabular-nums">¥{laborSubtotal.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setLaborIncludeTax(!laborIncludeTax)}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${laborIncludeTax ? "bg-indigo-500" : "bg-gray-300"
                                                }`}
                                        >
                                            <span
                                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${laborIncludeTax ? "translate-x-[18px]" : "translate-x-[3px]"
                                                    }`}
                                            />
                                        </button>
                                        <span className={laborIncludeTax ? "text-gray-600" : "text-gray-400"}>
                                            消費税 (10%)
                                        </span>
                                        {!laborIncludeTax && <span className="text-[10px] text-gray-400">※非課税</span>}
                                    </div>
                                    <span className={`font-bold tabular-nums ${laborIncludeTax ? "text-amber-700" : "text-gray-300"}`}>
                                        ¥{laborTax.toLocaleString()}
                                    </span>
                                </div>
                                <div className="border-t border-indigo-200 pt-2 flex items-center justify-between">
                                    <span className="text-sm font-bold text-indigo-800">合計{laborIncludeTax ? "（税込）" : ""}</span>
                                    <span className="text-lg font-bold tabular-nums text-indigo-800">¥{laborTotal.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                            <button className="btn-primary" onClick={handleSaveLabor}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
                                </svg>
                                一括登録して執行一覧へ
                            </button>
                            <button className="btn-secondary" onClick={() => { setLaborRows([emptyLaborRow()]); }}>
                                クリア
                            </button>
                            <span className="text-[11px] text-gray-400 ml-auto">
                                {laborRows.filter(r => r.itemName.trim() && r.amount > 0).length} 件のデータ
                            </span>
                        </div>
                    </div>
                )}

                {/* Form (Manual or after OCR) */}
                {showForm && mode !== "labor" && (
                    <div className="section-card p-5 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-gray-900">
                                {mode === "ocr" ? "抽出結果の確認・修正" : "執行情報の入力"}
                            </h2>
                            {errors.length > 0 && <span className="badge-error">{errors.length}件の確認事項</span>}
                        </div>

                        {/* Budget Split Selection */}
                        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="form-label text-brand-700 mb-0">予算（研究費）*</label>
                                {budgetSplits.length === 1 ? (
                                    <button
                                        type="button"
                                        onClick={addBudgetSplit}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 hover:border-brand-500 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                        </svg>
                                        複数予算に分割
                                    </button>
                                ) : (
                                    <span className={`text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${splitRemainder === 0 ? "bg-green-100 text-green-700" :
                                        splitRemainder > 0 ? "bg-amber-100 text-amber-700" :
                                            "bg-red-100 text-red-700"
                                        }`}>
                                        {splitRemainder === 0 ? "✓ 合計一致" : splitRemainder > 0 ? `残り ¥${splitRemainder.toLocaleString()}` : `超過 ¥${Math.abs(splitRemainder).toLocaleString()}`}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-2">
                                {budgetSplits.map((split, idx) => (
                                    <div key={split.id} className="flex items-center gap-2">
                                        {budgetSplits.length > 1 && (
                                            <span className="text-[10px] font-bold text-brand-400 w-4 flex-shrink-0">#{idx + 1}</span>
                                        )}
                                        <select
                                            className="form-select flex-1 min-w-0"
                                            value={split.budgetId}
                                            onChange={(e) => updateBudgetSplit(split.id, "budgetId", e.target.value)}
                                        >
                                            <option value="">-- 予算を選択 --</option>
                                            {budgets.map((b) => (
                                                <option key={b.id} value={b.id}>{b.name} {b.jCode ? `(${b.jCode})` : ""}</option>
                                            ))}
                                        </select>
                                        {budgetSplits.length > 1 && (
                                            <>
                                                <div className="relative flex-shrink-0 w-36">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">¥</span>
                                                    <input
                                                        type="number"
                                                        className="w-full form-input pl-6 text-sm font-bold tabular-nums"
                                                        value={split.amount || ""}
                                                        onChange={(e) => updateBudgetSplit(split.id, "amount", parseInt(e.target.value, 10) || 0)}
                                                        min={0}
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeBudgetSplit(split.id)}
                                                    className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                    title="この予算を削除"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                    </svg>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {budgetSplits.length > 1 && (
                                <button
                                    type="button"
                                    onClick={addBudgetSplit}
                                    className="w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium text-brand-500 hover:text-brand-700 border border-dashed border-brand-200 hover:border-brand-400 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    予算を追加
                                </button>
                            )}

                            {hasError("budgetSplits") && (
                                <p className="field-error-text">{getError("budgetSplits")}</p>
                            )}
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
                                >
                                    {ALL_CATEGORIES.map((cat) => (<option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">発注日</label>
                                <input type="date" className="form-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="form-label mb-0">納品日</label>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                            checked={dateUnknown}
                                            onChange={(e) => setDateUnknown(e.target.checked)}
                                        />
                                        <span className="text-xs text-gray-500">未定</span>
                                    </label>
                                </div>
                                {dateUnknown ? (
                                    <div className="form-input flex items-center text-gray-400 text-sm bg-gray-50">未定（登録後に編集可能）</div>
                                ) : (
                                    <input type="date" className={`form-input ${hasError("date") ? "field-error" : ""}`} value={date} onChange={(e) => setDate(e.target.value)} />
                                )}
                                {hasError("date") && <p className="field-error-text">{getError("date")}</p>}
                            </div>
                            <div>
                                <label className="form-label">品名 *</label>
                                <input
                                    type="text"
                                    className={`form-input ${hasError("itemName") ? "field-error" : ""}`}
                                    value={itemName}
                                    onChange={(e) => setItemName(e.target.value)}
                                    placeholder="例: 電源タップ"
                                />
                                {hasError("itemName") && <p className="field-error-text">{getError("itemName")}</p>}
                            </div>
                            <div>
                                <label className="form-label">規格等</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={specification}
                                    onChange={(e) => setSpecification(e.target.value)}
                                    placeholder="例: エレコム 10個口 2m"
                                />
                            </div>
                            <div>
                                <label className="form-label">支払先</label>
                                <input type="text" className="form-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="例: 法人カード / Amazon" />
                            </div>
                            {category !== "labor" && (
                                <>
                                    <div>
                                        <label className="form-label">単価</label>
                                        <input type="number" className="form-input" value={unitPrice || ""} onChange={(e) => setUnitPrice(parseInt(e.target.value, 10) || 0)} min={0} placeholder="0" />
                                    </div>
                                    <div>
                                        <label className="form-label">数量</label>
                                        <input type="number" className="form-input" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)} min={1} />
                                    </div>
                                </>
                            )}
                            <div className="md:col-span-2">
                                <label className="form-label">{category === "labor" ? "金額（総額）*" : "金額（円）*"}</label>
                                <input
                                    type="number"
                                    className={`form-input text-lg font-bold ${hasError("amount") ? "field-error" : ""}`}
                                    value={amount || ""}
                                    onChange={(e) => {
                                        const parsedAmount = parseInt(e.target.value, 10) || 0;
                                        setAmount(parsedAmount);
                                        syncSingleSplitAmount(parsedAmount);
                                        if (category === "labor") {
                                            setUnitPrice(parsedAmount);
                                            setQuantity(1);
                                        }
                                    }}
                                    min={0}
                                    placeholder="0"
                                />
                                {hasError("amount") && <p className="field-error-text">{getError("amount")}</p>}
                                {category !== "labor" && unitPrice > 0 && quantity > 1 && (
                                    <p className="text-[11px] text-gray-400 mt-1">単価 {unitPrice.toLocaleString()} × 数量 {quantity} = {(unitPrice * quantity).toLocaleString()}</p>
                                )}
                                {budgetSplits.length > 1 && amount > 0 && (
                                    <p className="text-[11px] text-brand-600 mt-1 font-medium">
                                        ↓ 下記の予算分割で合計 ¥{splitTotal.toLocaleString()} を割り当て中
                                    </p>
                                )}
                            </div>

                            {/* Memo */}
                            <div className="md:col-span-2">
                                <label className="form-label">備考・メモ</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={memo}
                                    onChange={(e) => setMemo(e.target.value)}
                                    placeholder="必要に応じて入力 (例: 立替払い、特記事項など)"
                                />
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
                                        見積書・添付ファイル
                                    </h3>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                        見積書や関連書類の画像を添付できます（任意）
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
                                    accept=".pdf,image/png,image/jpeg,image/webp,application/pdf"
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

                {/* OCR Raw Text - always show when available for debugging */}
                {ocrRawText && (
                    <details className="section-card">
                        <summary className="px-5 py-3 cursor-pointer text-xs font-medium text-amber-700 hover:bg-amber-50">📄 OCR読み取り全文（確認・修正の参考用）</summary>
                        <div className="px-5 pb-4">
                            <pre className="bg-amber-50 rounded-lg p-3 text-[10px] text-amber-900 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto border border-amber-200">{ocrRawText}</pre>
                        </div>
                    </details>
                )}

                {/* Existing Transactions - Editable */}
                {existingTransactions.length > 0 && (
                    <div className="section-card">
                        <div className="section-header">
                            <div className="section-title">登録済み執行データ</div>
                            <span className="text-[11px] text-gray-400">{existingTransactions.length} 件</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>No.</th>
                                        <th>納品日</th>
                                        <th>品名</th>
                                        <th className="text-right">金額</th>
                                        <th>費目</th>
                                        <th>予算</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {existingTransactions.map((tx) => {
                                        const colors = CATEGORY_COLORS[tx.category];
                                        const isLabor = tx.category === "labor";
                                        const isTax = isLabor && tx.itemName.includes("消費税");
                                        let rowClass = "border-b border-gray-100 last:border-0";
                                        if (isLabor) {
                                            rowClass = isTax ? "bg-slate-50/60 border-b border-gray-100 last:border-0" : "bg-indigo-50/30 border-b border-gray-100 last:border-0";
                                        }

                                        return (
                                            <tr key={tx.id} className={rowClass}>
                                                <td className="font-mono text-[11px] text-gray-500 whitespace-nowrap">{tx.slipNumber || "—"}</td>
                                                <td className="whitespace-nowrap text-[12px]">{tx.date}</td>
                                                <td className={`font-medium max-w-[180px] truncate ${isTax ? "text-gray-500 font-normal" : ""}`}>
                                                    {isTax && <span className="text-gray-400 mr-1.5 text-[10px]">↳</span>}
                                                    {isLabor && tx.status === "provisional" && (
                                                        <span className="inline-block bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 border border-amber-200 align-text-bottom">仮</span>
                                                    )}
                                                    {isLabor && tx.status === "confirmed" && (
                                                        <span className="inline-block bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 border border-emerald-200 align-text-bottom">確</span>
                                                    )}
                                                    {tx.itemName || "—"}
                                                    {tx.memo && (
                                                        <p className="text-[10px] text-gray-400 font-normal mt-0.5 truncate" title={tx.memo}>
                                                            📝 {tx.memo}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="text-right font-medium tabular-nums whitespace-nowrap">{fmtYen(tx.amount)}</td>
                                                <td>
                                                    {isTax ? (
                                                        <span className={`badge ${colors.bg} ${colors.text} opacity-80`}>人件費S（消費税）</span>
                                                    ) : (
                                                        <span className={`badge ${colors.bg} ${colors.text}`}>
                                                            {CATEGORY_LABELS[tx.category]}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-[11px] text-gray-400 max-w-[100px] truncate">{getBudgetName(tx.budgetId)}</td>
                                                <td>
                                                    <button
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-[11px] font-medium"
                                                        onClick={() => handleEditTx(tx)}
                                                        title="編集"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                                        </svg>
                                                        編集
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingTx && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={handleCancelEdit}>
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col animate-fade-in my-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                            <h3 className="text-base font-bold text-gray-900">執行データの編集</h3>
                            <button onClick={handleCancelEdit} className="w-8 h-8 rounded-lg hover:bg-gray-200 flex items-center justify-center transition-colors">
                                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-4">
                            {/* Budget Selection */}
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">伝票番号</label>
                                    <input
                                        type="text"
                                        className="form-input font-mono"
                                        value={editForm.slipNumber}
                                        onChange={(e) => setEditForm({ ...editForm, slipNumber: e.target.value })}
                                        placeholder="例: P250..."
                                    />
                                </div>
                                <div>
                                    <label className="form-label">費目カテゴリ</label>
                                    <select
                                        className="form-select"
                                        value={editForm.category}
                                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value as ExpenseCategory })}
                                    >
                                        {ALL_CATEGORIES.map((cat) => (<option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>))}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">発注日</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={editForm.orderDate}
                                        onChange={(e) => setEditForm({ ...editForm, orderDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">{editForm.category === "labor" ? "支払日 / 計上日" : "納品日"}</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={editForm.date}
                                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">{editForm.category === "labor" ? "内容・期間" : "品名"}</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={editForm.itemName}
                                        onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">{editForm.category === "labor" ? "対象者名" : "規格等"}</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={editForm.specification}
                                        onChange={(e) => setEditForm({ ...editForm, specification: e.target.value })}
                                    />
                                </div>
                                {editForm.category !== "labor" && (
                                    <div>
                                        <label className="form-label">支払先</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={editForm.payee}
                                            onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })}
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="form-label">{editForm.category === "labor" ? "支給額 (単価)" : "単価"}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={editForm.unitPrice || ""}
                                        onChange={(e) => setEditForm({ ...editForm, unitPrice: parseInt(e.target.value, 10) || 0 })}
                                        min={0}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">{editForm.category === "labor" ? "支給回数 (数量)" : "数量"}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={editForm.quantity}
                                        onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value, 10) || 1 })}
                                        min={1}
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label">金額（円）</label>
                                    <input
                                        type="number"
                                        className="form-input text-lg font-bold"
                                        value={editForm.amount || ""}
                                        onChange={(e) => setEditForm({ ...editForm, amount: parseInt(e.target.value, 10) || 0 })}
                                        min={0}
                                    />
                                    {editForm.unitPrice > 0 && editForm.quantity > 1 && (
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            単価 {editForm.unitPrice.toLocaleString()} × 数量 {editForm.quantity} = {(editForm.unitPrice * editForm.quantity).toLocaleString()}
                                        </p>
                                    )}
                                </div>

                                {editForm.category === "labor" && (
                                    <div className="md:col-span-2">
                                        <label className="form-label">ステータス (仮/確)</label>
                                        <div className="flex rounded-md overflow-hidden border border-gray-200 text-sm font-semibold mt-1">
                                            <button
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, status: "provisional" })}
                                                className={`flex-1 py-1.5 transition-colors ${editForm.status === "provisional" ? "bg-amber-400 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                                            >仮</button>
                                            <button
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, status: "confirmed" })}
                                                className={`flex-1 py-1.5 transition-colors border-l border-gray-200 ${editForm.status === "confirmed" ? "bg-green-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                                            >確定</button>
                                        </div>
                                    </div>
                                )}

                                <div className="md:col-span-2">
                                    <label className="form-label">備考・メモ</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={editForm.memo}
                                        onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                                        placeholder="特記事項など"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50 rounded-b-2xl">
                            <button className="btn-secondary" onClick={handleCancelEdit}>キャンセル</button>
                            <button className="btn-primary" onClick={handleSaveEdit}>保存する</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
