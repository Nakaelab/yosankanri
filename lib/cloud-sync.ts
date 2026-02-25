import type { SupabaseClient } from "@supabase/supabase-js";

// ==========================================
// クラウド同期モジュール
// localStorage ⇔ Supabase (app_data テーブル)
// ==========================================

let _client: SupabaseClient | null = null;
let syncReady = false;
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
export async function pullFromCloud(): Promise<boolean> {
    const supabase = await getClient();
    if (!supabase) return false;
    try {
        const { data, error } = await supabase
            .from("app_data")
            .select("key, value");

        if (error) {
            console.error("[Sync] Pull error:", error.message);
            return false;
        }

        if (data && data.length > 0) {
            for (const row of data) {
                localStorage.setItem(row.key, row.value);
            }
            console.log(`[Sync] Pulled ${data.length} keys from cloud`);
            return true;
        }
        return false;
    } catch (e) {
        console.error("[Sync] Pull failed:", e);
        return false;
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
            if (v !== null) rows.push({ key: k, value: v, updated_at: new Date().toISOString() });
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
export async function initSync(): Promise<void> {
    const supabase = await getClient();
    if (!supabase) {
        console.log("[Sync] Supabase not available, skipping sync");
        syncReady = true;
        return;
    }
    try {
        const hasCloud = await pullFromCloud();
        if (!hasCloud) await pushAllToCloud();
        syncReady = true;
        console.log("[Sync] Ready");
    } catch (e) {
        console.error("[Sync] Init failed:", e);
        syncReady = true;
    }
}

export function isSyncReady(): boolean {
    return syncReady;
}
