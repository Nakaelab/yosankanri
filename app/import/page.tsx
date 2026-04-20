"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
    ExtractedData, ExpenseCategory, CATEGORY_LABELS, ALL_CATEGORIES, CATEGORY_COLORS,
    DOC_TYPE_LABELS, DocType, validateExtracted, Transaction,
} from "@/lib/types";
import { extractFromOCRText, extractFromPastedText } from "@/lib/extract";
import { getCurrentTeacherId, saveTransaction, getBudgets, getTransactions } from "@/lib/storage";
import type { Budget } from "@/lib/types";

type Mode = "ocr" | "manual" | "labor";
type OCRStatus = "idle" | "loading" | "processing" | "done" | "error";
type LaborStatus = "provisional" | "confirmed";

/** 手入力バッチ入力行 */
interface ManualItemRow {
    id: string;
    itemName: string;
    specification: string;
    unitPrice: number;
    quantity: number;
    amount: number;
}

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

    // Paste-to-fill state
    const [pasteText, setPasteText] = useState("");
    const [pasteError, setPasteError] = useState("");

    // Form fields (shared by both modes)
    const [slipNumber, setSlipNumber] = useState("");
    const [orderDate, setOrderDate] = useState("");
    const [date, setDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    
    const [manualItems, setManualItems] = useState<ManualItemRow[]>([{ id: uuidv4(), itemName: "", specification: "", unitPrice: 0, quantity: 1, amount: 0 }]);
    const manualTotalAmount = manualItems.reduce((s, it) => s + (it.amount || 0), 0);

    const updateManualItem = (id: string, field: keyof ManualItemRow, value: string | number) => {
        setManualItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            const updated: any = { ...item, [field]: value };
            if (field === "unitPrice" || field === "quantity" || field === "amount") {
                if (field !== "amount") {
                    updated.amount = updated.unitPrice * updated.quantity;
                } else if (field === "amount" && updated.unitPrice === 0) {
                    updated.unitPrice = updated.amount;
                    updated.quantity = 1;
                }
            }
            return updated;
        }));
    };

    const addManualItem = () => setManualItems(prev => [...prev, { id: uuidv4(), itemName: "", specification: "", unitPrice: 0, quantity: 1, amount: 0 }]);
    const removeManualItem = (id: string) => setManualItems(prev => prev.length <= 1 ? prev : prev.filter(r => r.id !== id));

    const [payee, setPayee] = useState("");
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
        if (mode !== "labor") {
            setBudgetSplits(prev => prev.length === 1 ? [{ ...prev[0], amount: manualTotalAmount }] : prev);
        }
    }, [manualTotalAmount, mode]);

    const validate = () => {
        const errs: { field: string; message: string }[] = [];
        if (manualItems.some(i => !i.itemName.trim())) errs.push({ field: "itemName", message: "品名が空の項目があります" });
        if (manualTotalAmount < 0) errs.push({ field: "amount", message: "金額がマイナスです" });
        if (!date && !dateUnknown) errs.push({ field: "date", message: "日付が空です" });
        const validSplits = budgetSplits.filter(s => s.budgetId);
        if (validSplits.length === 0) errs.push({ field: "budgetSplits", message: "予算を1つ以上選択してください" });
        const splitTotal = validSplits.reduce((s, v) => s + v.amount, 0);
        if (manualTotalAmount > 0 && validSplits.length > 1 && splitTotal !== manualTotalAmount) {
            errs.push({ field: "budgetSplits", message: `予算の合計金額（¥${splitTotal.toLocaleString()}）が物品金額（¥${manualTotalAmount.toLocaleString()}）と一致しません` });
        }
        setErrors(errs);
        return errs;
    };

    // ---- Budget Splits helpers ----
    const splitTotal = budgetSplits.filter(s => s.budgetId).reduce((s, v) => s + v.amount, 0);
    const splitRemainder = manualTotalAmount - splitTotal;

    const addBudgetSplit = () => {
        // 残余金額を新しい行に自動セット（残余があれば）
        const remainder = manualTotalAmount - budgetSplits.filter(s => s.budgetId).reduce((s, v) => s + v.amount, 0);
        const autoAmount = remainder > 0 ? remainder : 0;
        setBudgetSplits(prev => [...prev, { id: uuidv4(), budgetId: "", amount: autoAmount }]);
    };

    const removeBudgetSplit = (id: string) => {
        setBudgetSplits(prev => prev.length <= 1 ? prev : prev.filter(s => s.id !== id));
    };

    const updateBudgetSplit = (id: string, field: keyof BudgetSplit, value: string | number) => {
        setBudgetSplits(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

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
    // ---- コピペテキストからフォーム入力 ----
    const applyPastedText = () => {
        if (!pasteText.trim()) {
            setPasteError("テキストを貼り付けてください");
            return;
        }
        try {
            const dataList = extractFromPastedText(pasteText);
            if (!dataList || dataList.length === 0) throw new Error("抽出データがありません");

            const rep = dataList.find(d => d.slipNumber) || dataList[0];
            const repOrderDate = dataList.find(d => d.orderDate) || dataList[0];
            const repPayee = dataList.find(d => d.payee) || dataList[0];
            const repMemo = dataList.find(d => d.memo) || dataList[0];
            const repCategory = dataList.find(d => d.category) || dataList[0];

            if (rep.slipNumber) setSlipNumber(rep.slipNumber);
            if (repOrderDate.orderDate) setOrderDate(repOrderDate.orderDate);
            if (repPayee.payee) setPayee(repPayee.payee);
            if (repMemo.memo !== undefined) setMemo(repMemo.memo);
            if (repCategory.category) setCategory(repCategory.category as ExpenseCategory);
            
            setManualItems(dataList.map(data => {
                const amt = data.amount !== undefined && data.amount > 0 ? data.amount : (data.unitPrice && data.quantity ? data.unitPrice * data.quantity : 0);
                return {
                    id: uuidv4(),
                    itemName: data.itemName || "",
                    specification: data.specification || "",
                    unitPrice: data.unitPrice || 0,
                    quantity: data.quantity || 1,
                    amount: amt,
                };
            }));

            // JコードからBudgetを自動マッチ
            let newBudgetId = "";
            if (repMemo.memo) {
                // 半角/全角/大文字/小文字のJ + 9桁の数字 に対応
                const jMatch = repMemo.memo.match(/[JＪjｊ](\d{9})/);
                if (jMatch) {
                    const extracted = `J${jMatch[1]}`;
                    // budgetsの中からjCodeが一致するものを探す
                    const matched = budgets.find(b =>
                        b.jCode &&
                        b.jCode.replace(/\s/g, "").toUpperCase() === extracted.toUpperCase()
                    );
                    if (matched) newBudgetId = matched.id;
                }
            }

            const totalAmt = dataList.reduce((sum, d) => {
                const a = d.amount !== undefined && d.amount > 0 ? d.amount : (d.unitPrice && d.quantity ? d.unitPrice * d.quantity : 0);
                return sum + a;
            }, 0);

            // 何も選択せずに = 空にする。見つかればその予算をセット。
            setBudgetSplits(prev => {
                if (prev.length === 1) {
                    return [{
                        ...prev[0],
                        budgetId: newBudgetId,
                        amount: totalAmt
                    }];
                }
                return prev;
            });

            setPasteError("");
            setMode("manual"); // フォームモードに切り替え
        } catch (e: any) {
            setPasteError("解析に失敗しました: " + (e?.message || String(e)));
        }
    };

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
                    // Scale 3.5x for higher resolution OCR
                    const viewport = page.getViewport({ scale: 3.5 });

                    const canvas = document.createElement("canvas");
                    canvas.width = Math.round(viewport.width);
                    canvas.height = Math.round(viewport.height);
                    const ctx = canvas.getContext("2d");
                    if (!ctx) throw new Error("Canvas context\u306e\u53d6\u5f97\u306b\u5931\u6557");

                    await page.render({ canvasContext: ctx, viewport }).promise;

                    // Preprocess: grayscale + contrast boost for better OCR
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const d = imgData.data;
                    const contrast = 1.8;
                    const brightness = 15;
                    for (let i = 0; i < d.length; i += 4) {
                        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                        const v = Math.min(255, Math.max(0, (gray - 128) * contrast + 128 + brightness));
                        d[i] = v; d[i + 1] = v; d[i + 2] = v;
                    }
                    ctx.putImageData(imgData, 0, 0);

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
            setPayee(data.payee);
            setManualItems([{
                id: uuidv4(),
                itemName: data.itemName,
                specification: data.specification,
                unitPrice: data.unitPrice,
                quantity: data.quantity,
                amount: data.amount,
            }]);
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

        const isMultipleBudgets = validSplits.length > 1;
        const groupSplitId = (isMultipleBudgets || manualItems.length > 1) ? uuidv4() : undefined;

        try {
            if (isMultipleBudgets) {
                // 予算が複数に分割されている場合（全体の合算として扱う）
                const combinedItemName = manualItems.length === 1 ? manualItems[0].itemName : `${manualItems[0].itemName} ほか${manualItems.length - 1}件`;
                const combinedSpec = manualItems.length === 1 ? manualItems[0].specification : "";
                validSplits.forEach((split, idx) => {
                    const txId = idx === 0 ? firstTxId : uuidv4();
                    saveTransaction({
                        id: txId,
                        budgetId: split.budgetId,
                        slipNumber,
                        orderDate: orderDate || undefined,
                        date: dateUnknown ? "未定" : date,
                        itemName: combinedItemName,
                        specification: combinedSpec,
                        payee,
                        unitPrice: split.amount,
                        quantity: 1,
                        amount: split.amount,
                        category,
                        memo,
                        attachmentCount: idx === 0 ? uploadedMeta.length : 0,
                        attachments: idx === 0 && uploadedMeta.length > 0 ? uploadedMeta : undefined,
                        ocrRawText: mode === "ocr" && idx === 0 ? ocrRawText : undefined,
                        splitGroupId: groupSplitId,
                        createdAt: new Date().toISOString(),
                    });
                });
            } else {
                // 予算が1つの場合、各品目を個別のTransactionとして保存
                manualItems.forEach((item, idx) => {
                    const txId = idx === 0 ? firstTxId : uuidv4();
                    saveTransaction({
                        id: txId,
                        budgetId: validSplits[0].budgetId,
                        slipNumber,
                        orderDate: orderDate || undefined,
                        date: dateUnknown ? "未定" : date,
                        itemName: item.itemName,
                        specification: item.specification,
                        payee,
                        unitPrice: item.unitPrice,
                        quantity: item.quantity,
                        amount: item.amount,
                        category,
                        memo,
                        attachmentCount: idx === 0 ? uploadedMeta.length : 0,
                        attachments: idx === 0 && uploadedMeta.length > 0 ? uploadedMeta : undefined,
                        ocrRawText: mode === "ocr" && idx === 0 ? ocrRawText : undefined,
                        createdAt: new Date().toISOString(),
                    });
                });
            }
            router.push("/transactions");
        } catch (e: any) {
            console.error("Save error:", e);
            if (e.name === "QuotaExceededError" || (e.message && e.message.includes("quota"))) {
                alert("ブラウザのデータ保存容量（約5MB）の上限に達しました。添付ファイルが多すぎる可能性があります。\n不要なデータや添付ファイルを削除してから再度お試しください。");
            } else {
                alert("データの保存中にエラーが発生しました:\n" + (e.message || String(e)));
            }
        }
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
        const validRows = laborRows.filter(r => r.itemName.trim() && r.amount >= 0);
        if (validRows.length === 0) { alert("少なくとも1行のデータを入力してください"); return; }

        const tid = getCurrentTeacherId();
        const teacherId = tid === "default" ? undefined : tid;

        try {
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
        } catch (e: any) {
            console.error("Save error:", e);
            if (e.name === "QuotaExceededError" || (e.message && e.message.includes("quota"))) {
                alert("ブラウザのデータ保存容量（約5MB）の上限に達しました。\n不要なデータや古い添付ファイルを削除してから再度お試しください。");
            } else {
                alert("データの保存中にエラーが発生しました:\n" + (e.message || String(e)));
            }
        }
    };

    // ---- Reset ----
    const resetForm = () => {
        setSlipNumber(""); setPayee("");
        setManualItems([{ id: uuidv4(), itemName: "", specification: "", unitPrice: 0, quantity: 1, amount: 0 }]);
        setCategory(mode === "labor" ? "labor" : "goods");
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
        if (editForm.amount < 0) { alert("金額を確認してください"); return; }

        const updated: Transaction = {
            ...editingTx,
            ...editForm,
        };

        try {
            saveTransaction(updated);
            setEditingTx(null);
            // Refresh existing transactions
            const txData = getTransactions();
            setExistingTransactions(
                txData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            );
        } catch (e: any) {
            console.error("Save error:", e);
            if (e.name === "QuotaExceededError" || (e.message && e.message.includes("quota"))) {
                alert("ブラウザのデータ保存容量（約5MB）の上限に達しました。添付ファイルが多すぎる可能性があります。\n不要なデータや添付ファイルを削除してから再度お試しください。");
            } else {
                alert("データの保存中にエラーが発生しました:\n" + (e.message || String(e)));
            }
        }
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
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                            テキスト抽出
                        </span>
                    </button>
                </div>

                {/* OCR Section */}
                {mode === "ocr" && ocrStatus !== "done" && (
                    <div className="section-card p-5 space-y-4">
                        {/* Paste-text tab */}
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-emerald-700 text-lg">📋</span>
                                <h3 className="text-sm font-bold text-emerald-800">ChatGPT等で抽出したテキストを貼り付け</h3>
                            </div>
                            <p className="text-xs text-emerald-700">
                                マークダウン表形式（| 項目 | 値 |）や「項目: 値」形式を貼り付けると自動入力されます。<br />
                                <strong>Jコードを含めると予算も自動選択されます！</strong>
                            </p>
                            <textarea
                                className="w-full h-36 text-xs font-mono border border-emerald-300 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-y"
                                placeholder={"| 項目 | 抽出値 |\n| --- | --- |\n| 品名 | 魚眼レンズ |\n| 規格 | DBK33GR0234 |\n| 支払先 | （株）アルゴ |\n| 単価 | 133,650円 |\n| 数量 | 1 |\n| 起案日 | R7/2/2 |\n| Jコード | J250000252 |  ← 予算が自動選択されます"}
                                value={pasteText}
                                onChange={e => { setPasteText(e.target.value); setPasteError(""); }}
                            />
                            {pasteError && <p className="text-xs text-red-600">{pasteError}</p>}
                            <button
                                className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-sm"
                                onClick={applyPastedText}
                            >
                                ✅ フォームに反映する
                            </button>
                        </div>
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
                                                    value={row.amount === 0 ? "" : row.amount}
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
                                                        value={split.amount === 0 ? "" : split.amount}
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
                            <div className="md:col-span-2">
                                <label className="form-label">支払先</label>
                                <input type="text" className="form-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="例: 法人カード / Amazon" />
                            </div>
                        </div>

                        {/* Items Array Block */}
                        <div className="mt-6 border-t border-gray-100 pt-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                    </svg>
                                    購入品目
                                </h3>
                                {manualItems.length > 0 && (
                                    <span className="text-[11px] text-gray-400 font-semibold bg-gray-100 px-2.5 py-1 rounded-full">計 {manualItems.length}件 / 合計 ¥{manualTotalAmount.toLocaleString()}</span>
                                )}
                            </div>
                            <div className="space-y-4">
                                {manualItems.map((item, idx) => (
                                    <div key={item.id} className="relative border border-gray-200 rounded-xl p-4 bg-gray-50/30 hover:border-brand-200 transition-colors">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-bold text-brand-500 bg-brand-50 px-2 py-0.5 rounded-md">行 {idx + 1}</span>
                                            {manualItems.length > 1 && (
                                                <button type="button" onClick={() => removeManualItem(item.id)} className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                            <div className="lg:col-span-2">
                                                <label className="text-[10px] font-semibold text-gray-500 mb-1 block">品名 *</label>
                                                <input type="text" className={`form-input ${!item.itemName.trim() && hasError('itemName') ? 'field-error' : ''}`} value={item.itemName} onChange={(e) => updateManualItem(item.id, 'itemName', e.target.value)} placeholder="電源タップ" />
                                            </div>
                                            <div className="lg:col-span-2">
                                                <label className="text-[10px] font-semibold text-gray-500 mb-1 block">規格等</label>
                                                <input type="text" className="form-input" value={item.specification} onChange={(e) => updateManualItem(item.id, 'specification', e.target.value)} placeholder="規格など" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-semibold text-gray-500 mb-1 block">単価</label>
                                                <input type="number" className="form-input" value={item.unitPrice === 0 ? "" : item.unitPrice} onChange={(e) => updateManualItem(item.id, 'unitPrice', parseInt(e.target.value)||0)} placeholder="0" min="0" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-semibold text-gray-500 mb-1 block">数量</label>
                                                <input type="number" className="form-input" value={item.quantity === 0 ? "" : item.quantity} onChange={(e) => updateManualItem(item.id, 'quantity', parseInt(e.target.value)||1)} placeholder="1" min="1" />
                                            </div>
                                            <div className="md:col-span-2 lg:col-span-2">
                                                <label className="text-[10px] font-semibold text-gray-500 mb-1 block">金額（円）*</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">¥</span>
                                                    <input type="number" className="form-input pl-8 font-bold text-gray-900 bg-white" value={item.amount === 0 ? "" : item.amount} onChange={(e) => updateManualItem(item.id, 'amount', parseInt(e.target.value)||0)} placeholder="0" min="0" />
                                                </div>
                                                {item.unitPrice > 0 && item.quantity > 1 && (
                                                    <p className="text-[10px] text-gray-400 mt-1">単価 {item.unitPrice.toLocaleString()} × 数量 {item.quantity} = {(item.unitPrice * item.quantity).toLocaleString()}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <button
                                type="button"
                                onClick={addManualItem}
                                className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-dashed border-brand-200 hover:border-brand-400 hover:bg-brand-50 px-4 py-2 rounded-xl transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                品目を行追加
                            </button>
                            {hasError("amount") && <p className="field-error-text mt-2">{getError("amount")}</p>}
                            {budgetSplits.length > 1 && manualTotalAmount > 0 && (
                                <p className="text-[11px] text-brand-600 mt-2 font-medium">
                                    ↓ 予算分割で合計 ¥{splitTotal.toLocaleString()} を割り当て中
                                </p>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

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

            </div>
        </div>
    );
}
