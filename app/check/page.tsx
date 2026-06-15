"use client";

import { useEffect, useState, useCallback } from "react";
import { Budget, Transaction, CATEGORY_LABELS } from "@/lib/types";
import { getBudgets, getTransactions, saveTransaction } from "@/lib/storage";

// =============================================
// 整合チェック画面
// =============================================

interface ExcelRow {
    finalProcessingNo: string;
    amount: number;
    rawRow: string[]; // 元のエクセル行データ（デバッグ用）
}

interface MatchResult {
    type: "matched" | "already_applied" | "conflict" | "excel_only" | "app_only";
    excelRow?: ExcelRow;
    transaction?: Transaction;
    finalProcessingNo?: string;
}

export default function CheckPage() {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
    const [results, setResults] = useState<MatchResult[]>([]);
    const [checked, setChecked] = useState(false);
    const [applied, setApplied] = useState(false);
    const [fileName, setFileName] = useState<string>("");
    const [dragOver, setDragOver] = useState(false);
    const [excelHeader, setExcelHeader] = useState<string[]>([]);

    useEffect(() => {
        const b = getBudgets();
        const t = getTransactions();
        setBudgets(b);
        setAllTransactions(t);
        if (b.length > 0) setSelectedBudgetId(b[0].id);
    }, []);

    const parseExcel = useCallback(async (file: File) => {
        const XLSX = await import("xlsx");
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data);

        // 最初のシートを使用
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rows.length > 0) {
            setExcelHeader(rows[0].map((c: any) => String(c ?? "")));
        }

        const excelRows: ExcelRow[] = [];

        // 1行目はヘッダーなので2行目（index 1）から
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            // C列(index 2) = 最終処理No, G列(index 6) = 執行金額
            const finalNo = String(row[2] ?? "").trim();
            const amountRaw = row[6];
            const amount = typeof amountRaw === "number" ? amountRaw : parseFloat(String(amountRaw ?? "0").replace(/,/g, ""));

            if (!finalNo && (isNaN(amount) || amount === 0)) continue; // 空行スキップ

            excelRows.push({
                finalProcessingNo: finalNo,
                amount: isNaN(amount) ? 0 : amount,
                rawRow: row.map((c: any) => String(c ?? "")),
            });
        }

        return excelRows;
    }, [setExcelHeader]);

    const runCheck = useCallback(async (file: File) => {
        setFileName(file.name);
        setChecked(false);
        setApplied(false);
        setResults([]);

        const excelRows = await parseExcel(file);
        const budgetTxs = allTransactions.filter(t => t.budgetId === selectedBudgetId);

        // 金額でマッチング
        // 同じ金額が複数ある場合を考慮し、使用済みフラグで管理
        const usedTxIds = new Set<string>();
        const usedExcelIdxs = new Set<number>();
        const matchResults: MatchResult[] = [];

        // まずExcel行を順番に見て、アプリのデータと金額マッチ
        for (let ei = 0; ei < excelRows.length; ei++) {
            const er = excelRows[ei];
            // まだ使われていないアプリの取引から金額一致を探す
            const matchTx = budgetTxs.find(t => !usedTxIds.has(t.id) && t.amount === er.amount);
            if (matchTx) {
                usedTxIds.add(matchTx.id);
                usedExcelIdxs.add(ei);

                // 状況に応じてタイプを分岐
                let type: "matched" | "already_applied" | "conflict" = "matched";
                if (matchTx.finalProcessingNo) {
                    if (matchTx.finalProcessingNo === er.finalProcessingNo) {
                        type = "already_applied";
                    } else {
                        type = "conflict";
                    }
                }

                matchResults.push({
                    type: type,
                    excelRow: er,
                    transaction: matchTx,
                    finalProcessingNo: er.finalProcessingNo,
                });
            }
        }

        // エクセルにのみ存在
        for (let ei = 0; ei < excelRows.length; ei++) {
            if (usedExcelIdxs.has(ei)) continue;
            matchResults.push({
                type: "excel_only",
                excelRow: excelRows[ei],
            });
        }

        // アプリにのみ存在
        for (const tx of budgetTxs) {
            if (usedTxIds.has(tx.id)) continue;
            matchResults.push({
                type: "app_only",
                transaction: tx,
            });
        }

        setResults(matchResults);
        setChecked(true);
    }, [allTransactions, selectedBudgetId, parseExcel]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) runCheck(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) runCheck(file);
    };

    const handleApply = () => {
        // 新規一致および番号不一致（上書き）を反映対象とする
        const toApply = results.filter(r => (r.type === "matched" || r.type === "conflict") && r.transaction && r.finalProcessingNo);
        for (const m of toApply) {
            if (m.transaction && m.finalProcessingNo) {
                const updated: Transaction = {
                    ...m.transaction,
                    finalProcessingNo: m.finalProcessingNo,
                    slipNumber: m.finalProcessingNo,
                };
                saveTransaction(updated);
            }
        }
        // ローカルstateも更新
        const updatedTxs = [...allTransactions];
        for (const m of toApply) {
            if (m.transaction && m.finalProcessingNo) {
                const idx = updatedTxs.findIndex(t => t.id === m.transaction!.id);
                if (idx >= 0) {
                    updatedTxs[idx] = { ...updatedTxs[idx], finalProcessingNo: m.finalProcessingNo, slipNumber: m.finalProcessingNo };
                }
            }
        }
        setAllTransactions(updatedTxs);

        // 反映後の結果ステートを更新（matched, conflict -> already_applied）
        const updatedResults = results.map(r => {
            if ((r.type === "matched" || r.type === "conflict") && r.transaction && r.finalProcessingNo) {
                return {
                    ...r,
                    type: "already_applied" as const,
                    transaction: {
                        ...r.transaction,
                        finalProcessingNo: r.finalProcessingNo,
                        slipNumber: r.finalProcessingNo
                    }
                };
            }
            return r;
        });
        setResults(updatedResults);
        setApplied(true);
    };

    const handleExportInconsistencies = async () => {
        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();

        // 1. エクセルのみ存在シート
        const excelOnlyResults = results.filter(r => r.type === "excel_only");
        const excelOnlyData = excelOnlyResults.map(r => r.excelRow!.rawRow);
        
        // ヘッダーを追加してシート作成
        const wsExcel = XLSX.utils.aoa_to_sheet([excelHeader, ...excelOnlyData]);
        XLSX.utils.book_append_sheet(wb, wsExcel, "エクセルのみ存在");

        // 2. アプリのみ存在シート
        const appOnlyResults = results.filter(r => r.type === "app_only");
        const appOnlyHeaders = ["伝票番号", "納品日", "品名", "規格", "支払先", "金額", "カテゴリ", "備考"];
        const appOnlyData = appOnlyResults.map(r => {
            const tx = r.transaction!;
            return [
                tx.slipNumber || "",
                tx.date || "",
                tx.itemName || "",
                tx.specification || "",
                tx.payee || "",
                tx.amount,
                tx.category ? CATEGORY_LABELS[tx.category] : "",
                tx.memo || ""
            ];
        });
        
        const wsApp = XLSX.utils.aoa_to_sheet([appOnlyHeaders, ...appOnlyData]);
        XLSX.utils.book_append_sheet(wb, wsApp, "アプリのみ存在");

        // ファイル書き出し
        // 予算名があればファイル名に含める
        const budget = budgets.find(b => b.id === selectedBudgetId);
        const budgetName = budget ? `_${budget.name}` : "";
        const today = new Date().toISOString().split("T")[0];
        const exportFileName = `不整合ログ${budgetName}_${today}.xlsx`;

        XLSX.writeFile(wb, exportFileName);
    };

    const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
    const newMatchedCount = results.filter(r => r.type === "matched").length;
    const alreadyAppliedCount = results.filter(r => r.type === "already_applied").length;
    const conflictCount = results.filter(r => r.type === "conflict").length;
    const excelOnlyCount = results.filter(r => r.type === "excel_only").length;
    const appOnlyCount = results.filter(r => r.type === "app_only").length;

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">整合チェック</h1>
                <p className="text-sm text-gray-500 mt-1">事務から返却されたエクセルとアプリのデータを照合します</p>
            </div>

            <div className="p-4 md:p-6 space-y-6">
                {/* ===== 設定エリア ===== */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
                    {/* 予算選択 */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">予算を選択</label>
                        <select
                            value={selectedBudgetId}
                            onChange={e => {
                                setSelectedBudgetId(e.target.value);
                                setChecked(false);
                                setResults([]);
                                setApplied(false);
                            }}
                            className="form-input text-sm w-full max-w-md"
                        >
                            {budgets.map(b => (
                                <option key={b.id} value={b.id}>{b.name}（{b.fiscalYear}年度）</option>
                            ))}
                        </select>
                    </div>

                    {/* ファイルアップロード */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">エクセルファイル</label>
                        <div
                            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                                dragOver
                                    ? "border-brand-500 bg-brand-50"
                                    : "border-gray-200 hover:border-gray-300"
                            }`}
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                        >
                            <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                            <p className="text-sm text-gray-500 mb-1">ここにエクセルをドラッグ＆ドロップ</p>
                            <p className="text-xs text-gray-400 mb-3">または</p>
                            <label className="btn-primary text-sm cursor-pointer inline-block">
                                ファイルを選択
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </label>
                            {fileName && (
                                <p className="mt-3 text-xs text-brand-600 font-medium">
                                    📄 {fileName}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== 結果 ===== */}
                {checked && (
                    <div className="space-y-4">
                        {/* サマリー */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                                <div className="text-2xl font-bold text-emerald-600">{newMatchedCount}</div>
                                <div className="text-xs text-gray-500 mt-1">✅ 一致（新規）</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                                <div className="text-2xl font-bold text-slate-500">{alreadyAppliedCount}</div>
                                <div className="text-xs text-gray-500 mt-1">🗹 一致（反映済み）</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                                <div className="text-2xl font-bold text-orange-500">{conflictCount}</div>
                                <div className="text-xs text-gray-500 mt-1">⚡ 番号不一致</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                                <div className="text-2xl font-bold text-red-500">{excelOnlyCount}</div>
                                <div className="text-xs text-gray-500 mt-1">❌ エクセルのみ</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                                <div className="text-2xl font-bold text-amber-500">{appOnlyCount}</div>
                                <div className="text-xs text-gray-500 mt-1">⚠️ アプリのみ</div>
                            </div>
                        </div>

                        {/* 反映ボタン */}
                        {(newMatchedCount > 0 || conflictCount > 0) && !applied && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-bold text-emerald-800">
                                        {newMatchedCount + conflictCount}件の新規一致・上書き対象が見つかりました
                                    </div>
                                    <div className="text-xs text-emerald-600 mt-0.5">
                                        一致した取引に最終処理Noを反映（または更新）します
                                    </div>
                                </div>
                                <button
                                    onClick={handleApply}
                                    className="btn-primary text-sm whitespace-nowrap"
                                >
                                    最終処理Noを反映
                                </button>
                            </div>
                        )}

                        {applied && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                                <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                                <div className="text-sm font-bold text-emerald-800">
                                    最終処理Noを反映しました
                                </div>
                            </div>
                        )}

                        {/* 不整合ログ出力ボタン */}
                        {(excelOnlyCount > 0 || appOnlyCount > 0) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <div className="text-sm font-bold text-amber-800">
                                        不整合（一致しなかった取引）が{excelOnlyCount + appOnlyCount}件あります
                                    </div>
                                    <div className="text-xs text-amber-600 mt-0.5">
                                        エクセルのみ、またはアプリのみに存在する取引のリストをダウンロードできます
                                    </div>
                                </div>
                                <button
                                    onClick={handleExportInconsistencies}
                                    className="btn-secondary text-sm whitespace-nowrap bg-white hover:bg-gray-50 text-gray-700 py-2 px-4 rounded-lg flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                    不整合ログを出力 (Excel)
                                </button>
                            </div>
                        )}

                        {/* 詳細ログ */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-100">
                                <h2 className="text-sm font-bold text-gray-900">照合ログ</h2>
                            </div>

                            <div className="divide-y divide-gray-50">
                                {/* 一致 (新規) */}
                                {results.filter(r => r.type === "matched").map((r, i) => (
                                    <div key={`m-${i}`} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                                        <span className="text-emerald-500 text-lg flex-shrink-0 mt-0.5">✅</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-gray-900">
                                                新規一致: {fmt(r.excelRow!.amount)}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                最終処理No: <span className="font-bold text-brand-600">{r.finalProcessingNo}</span>
                                                {" → "}
                                                <span className="text-gray-700">{r.transaction!.itemName}</span>
                                                {r.transaction!.slipNumber && (
                                                    <span className="text-gray-400 ml-1">（現No: {r.transaction!.slipNumber}）</span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="badge badge-success text-[10px] ml-auto shrink-0 self-center">反映待ち</span>
                                    </div>
                                ))}

                                {/* 一致 (反映済み) */}
                                {results.filter(r => r.type === "already_applied").map((r, i) => (
                                    <div key={`aa-${i}`} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors opacity-75">
                                        <span className="text-slate-400 text-lg flex-shrink-0 mt-0.5">🗹</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-slate-600">
                                                反映済み: {fmt(r.excelRow!.amount)}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                最終処理No: <span className="font-semibold text-slate-700">{r.finalProcessingNo}</span>
                                                {" → "}
                                                <span className="text-slate-600">{r.transaction!.itemName}</span>
                                                {r.transaction!.slipNumber && (
                                                    <span className="text-slate-400 ml-1">（現No: {r.transaction!.slipNumber}）</span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 ml-auto shrink-0 self-center">登録済み</span>
                                    </div>
                                ))}

                                {/* 一致 (番号不一致) */}
                                {results.filter(r => r.type === "conflict").map((r, i) => (
                                    <div key={`c-${i}`} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors bg-orange-50/30">
                                        <span className="text-orange-500 text-lg flex-shrink-0 mt-0.5">⚡</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-orange-800">
                                                最終処理No不一致: {fmt(r.excelRow!.amount)}
                                            </div>
                                            <div className="text-xs text-orange-600 mt-0.5">
                                                Excel値: <span className="font-bold text-orange-700">{r.finalProcessingNo}</span>
                                                {" ｜ アプリ登録値: "}
                                                <span className="font-bold text-red-600">{r.transaction!.finalProcessingNo || "(空)"}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                対象: <span className="text-gray-700">{r.transaction!.itemName}</span>
                                                {r.transaction!.slipNumber && (
                                                    <span className="text-gray-400 ml-1">（現No: {r.transaction!.slipNumber}）</span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="badge badge-warning text-[10px] ml-auto shrink-0 self-center">上書き対象</span>
                                    </div>
                                ))}

                                {/* エクセルのみ */}
                                {results.filter(r => r.type === "excel_only").map((r, i) => (
                                    <div key={`e-${i}`} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                                        <span className="text-red-400 text-lg flex-shrink-0 mt-0.5">❌</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-red-700">
                                                エクセルにのみ存在: {fmt(r.excelRow!.amount)}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                最終処理No: {r.excelRow!.finalProcessingNo || "(空)"}
                                                {r.excelRow!.rawRow[0] && ` | ${r.excelRow!.rawRow[0]}`}
                                                {r.excelRow!.rawRow[1] && ` | ${r.excelRow!.rawRow[1]}`}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* アプリのみ */}
                                {results.filter(r => r.type === "app_only").map((r, i) => (
                                    <div key={`a-${i}`} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                                        <span className="text-amber-400 text-lg flex-shrink-0 mt-0.5">⚠️</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-amber-700">
                                                アプリにのみ存在: {fmt(r.transaction!.amount)}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                {r.transaction!.itemName}
                                                {r.transaction!.slipNumber && ` | No: ${r.transaction!.slipNumber}`}
                                                {r.transaction!.date && ` | ${r.transaction!.date}`}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {results.length === 0 && (
                                    <div className="px-5 py-8 text-center text-sm text-gray-400">
                                        照合結果がありません
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
