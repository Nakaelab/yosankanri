import type { SupabaseClient } from "@supabase/supabase-js";
import LZString from "lz-string";

// ==========================================
// クラウド同期モジュール
// localStorage ⇔ Supabase (app_data テーブル)
// ==========================================

let _client: SupabaseClient | null = null;
let syncReady = false;
let initSyncPromise: Promise<{ pulled: boolean; error?: string }> | null = null;
const pendingPushes: Map<string, ReturnType<typeof setTimeout>> = new Map();

/**
 * ブラウザ実行時のみ Supabase クライアントを動的インポートで取得
 */
async function getClient(): Promise<SupabaseClient | null> {
    if (typeof window === "undefined") return null;
    if (_client) return _client;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    // 動的インポート: ビルド時には実行されない
    const { createClient } = await import("@supabase/supabase-js");
    _client = createClient(url, key);
    return _client;
}

/**
 * クラウドからデータを取得して localStorage に書き込む
 */
export async function pullFromCloud(): Promise<{ success: boolean; hasData: boolean; error?: any }> {
    const supabase = await getClient();
    if (!supabase) return { success: false, hasData: false, error: "No Supabase client" };
    try {
        const { data, error } = await supabase
            .from("app_data")
            .select("key, value");

        if (error) {
            console.error("[Sync] Pull error:", error.message);
            return { success: false, hasData: false, error };
        }

        if (data && data.length > 0) {
            for (const row of data) {
                try {
                    let valToStore = row.value;
                    if (row.key.includes("budget_app_transactions") || row.key.includes("budget_app_budgets")) {
                        valToStore = "lz:" + LZString.compressToUTF16(row.value);
                    }
                    localStorage.setItem(row.key, valToStore);
                } catch (setItemError: any) {
                    console.error(`[Sync] Failed to setItem for ${row.key}:`, setItemError);
                    if (setItemError.name === "QuotaExceededError" || (setItemError.message && setItemError.message.includes("quota"))) {
                        // ブラウザ容量超過の場合は致命的なので、クラウドの有効なデータを上書きしないように失敗とする
                        return { success: false, hasData: true, error: setItemError };
                    }
                }
            }
            console.log(`[Sync] Pulled ${data.length} keys from cloud`);
            return { success: true, hasData: true };
        }
        return { success: true, hasData: false };
    } catch (e: any) {
        console.error("[Sync] Pull failed:", e);
        return { success: false, hasData: false, error: e };
    }
}

/**
 * 1 つのキーをクラウドにプッシュ (デバウンス付き)
 */
export function pushToCloud(key: string, value: string): void {
    if (!syncReady) return;

    const existing = pendingPushes.get(key);
    if (existing) clearTimeout(existing);

    pendingPushes.set(
        key,
        setTimeout(async () => {
            pendingPushes.delete(key);
            const supabase = await getClient();
            if (!supabase) return;
            try {
                const { error } = await supabase.from("app_data").upsert({
                    key,
                    value,
                    updated_at: new Date().toISOString(),
                });
                if (error) console.error(`[Sync] Push error for ${key}:`, error.message);
                else console.log(`[Sync] Pushed: ${key}`);
            } catch (e) {
                console.error(`[Sync] Push failed for ${key}:`, e);
            }
        }, 500)
    );
}

/**
 * クラウドからキーを削除
 */
export async function deleteFromCloud(key: string): Promise<void> {
    if (!syncReady) return;
    const supabase = await getClient();
    if (!supabase) return;
    try {
        const { error } = await supabase.from("app_data").delete().eq("key", key);
        if (error) console.error(`[Sync] Delete error for ${key}:`, error.message);
    } catch (e) {
        console.error(`[Sync] Delete failed for ${key}:`, e);
    }
}

/**
 * localStorage の budget_app_* キーをすべてクラウドにプッシュ
 */
async function pushAllToCloud(): Promise<void> {
    const supabase = await getClient();
    if (!supabase) return;
    const rows: { key: string; value: string; updated_at: string }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("budget_app_")) {
            const v = localStorage.getItem(k);
            if (v !== null) {
                let valToPush = v;
                if (v.startsWith("lz:")) {
                    valToPush = LZString.decompressFromUTF16(v.substring(3)) || v;
                }
                rows.push({ key: k, value: valToPush, updated_at: new Date().toISOString() });
            }
        }
    }
    if (rows.length === 0) return;
    try {
        const { error } = await supabase.from("app_data").upsert(rows);
        if (error) console.error("[Sync] Push-all error:", error.message);
        else console.log(`[Sync] Pushed all ${rows.length} keys to cloud`);
    } catch (e) {
        console.error("[Sync] Push-all failed:", e);
    }
}

/**
 * 初期同期
 */
export function initSync(): Promise<{ pulled: boolean; error?: string }> {
    if (initSyncPromise) {
        return initSyncPromise;
    }

    initSyncPromise = (async () => {
        const supabase = await getClient();
        if (!supabase) {
            console.log("[Sync] Supabase not available, skipping sync");
            syncReady = true;
            return { pulled: false };
        }
        try {
            const result = await pullFromCloud();
            
            // エラーによるPull失敗時は、絶対にスマホなどの空データ（または壊れたローカルデータ）をPushして上書きしてはいけない
            if (!result.success) {
                console.warn("[Sync] Pull failed, skipping push to prevent data loss.");
                syncReady = true;
                // 容量超過エラーがあった場合は上位に通知
                if (result.error?.name === "QuotaExceededError" || (result.error?.message && result.error.message.includes("quota"))) {
                   return { pulled: false, error: "QUOTA_EXCEEDED" };
                }
                return { pulled: false };
            }

            // Pull は成功したが、クラウドが空だった場合のみローカルの初期データをPushする
            if (result.success && !result.hasData) {
                await pushAllToCloud();
            }

            syncReady = true;
            console.log("[Sync] Ready");
            return { pulled: result.hasData };
        } catch (e) {
            console.error("[Sync] Init failed:", e);
            syncReady = true;
            return { pulled: false, error: "INIT_FAILED" };
        }
    })();

    return initSyncPromise;
}

export function isSyncReady(): boolean {
    return syncReady;
}
