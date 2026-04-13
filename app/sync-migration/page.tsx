"use client";
import { useEffect, useState } from "react";

export default function SyncMigrationPage() {
    const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
    const [log, setLog] = useState<string[]>([]);
    const [localKeys, setLocalKeys] = useState<{ key: string; size: number }[]>([]);

    useEffect(() => {
        // LocalStorageのbudget_app_*キーを一覧表示
        const keys: { key: string; size: number }[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith("budget_app_")) {
                const v = localStorage.getItem(k) ?? "";
                keys.push({ key: k, size: v.length });
            }
        }
        setLocalKeys(keys);
    }, []);

    const addLog = (msg: string) => setLog(prev => [...prev, msg]);

    const runMigration = async () => {
        setStatus("running");
        setLog([]);
        addLog("🔍 Supabase接続を確認中...");

        try {
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

            if (!url || !key) {
                addLog("❌ エラー: .env.localにURLかキーが設定されていません");
                setStatus("error");
                return;
            }

            addLog(`✅ URL: ${url}`);
            addLog(`✅ Anonキー: ${key.slice(0, 20)}...`);

            const { createClient } = await import("@supabase/supabase-js");
            const supabase = createClient(url, key);

            // 接続テスト
            const { error: testError } = await supabase.from("app_data").select("key").limit(1);
            if (testError) {
                addLog(`❌ 接続エラー: ${testError.message}`);
                addLog("⚠️ APIキーかURLが間違っているか、app_dataテーブルが存在しない可能性があります");
                setStatus("error");
                return;
            }
            addLog("✅ Supabase接続OK！");

            // LocalStorageのデータを収集
            const rows: { key: string; value: string; updated_at: string }[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith("budget_app_")) {
                    const v = localStorage.getItem(k);
                    if (v !== null) {
                        rows.push({ key: k, value: v, updated_at: new Date().toISOString() });
                        addLog(`📦 対象: ${k} (${v.length}文字)`);
                    }
                }
            }

            if (rows.length === 0) {
                addLog("⚠️ LocalStorageにbudget_app_*のデータが見つかりません");
                setStatus("done");
                return;
            }

            addLog(`\n🚀 ${rows.length}件のデータをクラウドに送信中...`);

            const { error: upsertError } = await supabase.from("app_data").upsert(rows);
            if (upsertError) {
                addLog(`❌ アップロードエラー: ${upsertError.message}`);
                setStatus("error");
                return;
            }

            addLog(`\n🎉 完了！ ${rows.length}件のデータをSupabaseに移行しました`);
            addLog("📱 スマホでアプリを開き直すと最新データが反映されます");
            setStatus("done");
        } catch (e) {
            addLog(`❌ 予期しないエラー: ${e}`);
            setStatus("error");
        }
    };

    return (
        <div style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            padding: "40px 20px",
            fontFamily: "'Inter', sans-serif",
            color: "#e2e8f0"
        }}>
            <div style={{
                maxWidth: 700,
                margin: "0 auto",
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(10px)",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.1)",
                padding: 40
            }}>
                <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#f1f5f9" }}>
                    🔄 データ移行ツール
                </h1>
                <p style={{ color: "#94a3b8", marginBottom: 32, lineHeight: 1.6 }}>
                    PCのLocalStorageに保存されているデータをSupabaseクラウドに移行します。
                    <br />新しいAPIキーを<code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4 }}>.env.local</code>に設定してからこのボタンを押してください。
                </p>

                {/* LocalStorage内容 */}
                {localKeys.length > 0 && (
                    <div style={{
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: 16,
                        marginBottom: 24
                    }}>
                        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>LocalStorageに見つかったデータ（移行対象）：</p>
                        {localKeys.map(({ key, size }) => (
                            <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                <span style={{ color: "#7dd3fc", fontFamily: "monospace" }}>{key}</span>
                                <span style={{ color: "#64748b" }}>{(size / 1024).toFixed(1)} KB</span>
                            </div>
                        ))}
                    </div>
                )}

                {localKeys.length === 0 && (
                    <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 16, marginBottom: 24 }}>
                        ⚠️ LocalStorageにbudget_appのデータが見つかりません。このブラウザ・このPCで操作したデータがあるか確認してください。
                    </div>
                )}

                <button
                    onClick={runMigration}
                    disabled={status === "running" || localKeys.length === 0}
                    style={{
                        width: "100%",
                        padding: "16px 32px",
                        background: status === "done"
                            ? "linear-gradient(135deg, #22c55e, #16a34a)"
                            : status === "error"
                            ? "linear-gradient(135deg, #ef4444, #dc2626)"
                            : status === "running"
                            ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                            : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: status === "running" || localKeys.length === 0 ? "not-allowed" : "pointer",
                        opacity: localKeys.length === 0 ? 0.5 : 1,
                        transition: "all 0.3s ease",
                        marginBottom: 24
                    }}
                >
                    {status === "idle" && "🚀 クラウドに移行する"}
                    {status === "running" && "⏳ 移行中..."}
                    {status === "done" && "✅ 移行完了！"}
                    {status === "error" && "❌ エラー発生（ログを確認）"}
                </button>

                {/* ログ表示 */}
                {log.length > 0 && (
                    <div style={{
                        background: "#0f172a",
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.1)",
                        padding: 16,
                        fontFamily: "monospace",
                        fontSize: 13,
                        lineHeight: 1.8,
                        maxHeight: 300,
                        overflowY: "auto"
                    }}>
                        {log.map((line, i) => (
                            <div key={i} style={{ color: line.startsWith("❌") ? "#f87171" : line.startsWith("✅") || line.startsWith("🎉") ? "#4ade80" : "#94a3b8" }}>
                                {line}
                            </div>
                        ))}
                    </div>
                )}

                {status === "done" && (
                    <div style={{
                        marginTop: 24,
                        background: "rgba(34,197,94,0.1)",
                        border: "1px solid rgba(34,197,94,0.3)",
                        borderRadius: 8,
                        padding: 16,
                        lineHeight: 1.7
                    }}>
                        <strong>次のステップ：</strong>
                        <ol style={{ marginTop: 8, paddingLeft: 20, color: "#94a3b8" }}>
                            <li>スマホのブラウザでアプリを開く</li>
                            <li>ページをリロードする</li>
                            <li>最新データが反映されているか確認する</li>
                        </ol>
                    </div>
                )}
            </div>
        </div>
    );
}
