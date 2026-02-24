import { supabase } from "./supabase";

// ==========================================
// クラウド同期モジュール
// localStorage ⇔ Supabase (app_data テーブル)
//
// 読み取りは localStorage (同期的) から行い、
// 書き込み時に Supabase へも非同期プッシュする。
// アプリ起動時に Supabase からデータを取得して
// localStorage へキャッシュする。
// ==========================================

let syncReady = false;
const pendingPushes: Map<string, ReturnType<typeof setTimeout>> = new Map();

/**
 * クラウドからデータを取得して localStorage に書き込む
 * @returns true if cloud had data
 */
export async function pullFromCloud(): Promise<boolean> {
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
export async function pushToCloud(key: string, value: string): Promise<void> {
    if (!syncReady) return; // 初期同期完了前はプッシュしない

    // デバウンス: 同じキーへの連続書き込みをまとめる (500ms)
    const existing = pendingPushes.get(key);
    if (existing) clearTimeout(existing);

    pendingPushes.set(
        key,
        setTimeout(async () => {
            pendingPushes.delete(key);
            try {
                const { error } = await supabase.from("app_data").upsert({
                    key,
                    value,
                    updated_at: new Date().toISOString(),
                });
                if (error) {
                    console.error(`[Sync] Push error for ${key}:`, error.message);
                } else {
                    console.log(`[Sync] Pushed: ${key}`);
                }
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
    const rows: { key: string; value: string; updated_at: string }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("budget_app_")) {
            const value = localStorage.getItem(key);
            if (value !== null) {
                rows.push({
                    key,
                    value,
                    updated_at: new Date().toISOString(),
                });
            }
        }
    }

    if (rows.length === 0) return;

    try {
        const { error } = await supabase.from("app_data").upsert(rows);
        if (error) {
            console.error("[Sync] Push-all error:", error.message);
        } else {
            console.log(`[Sync] Pushed all ${rows.length} keys to cloud`);
        }
    } catch (e) {
        console.error("[Sync] Push-all failed:", e);
    }
}

/**
 * 初期同期:
 * 1. クラウドにデータがあれば → localStorage にコピー
 * 2. クラウドが空で localStorage にデータがあれば → クラウドにアップロード
 */
export async function initSync(): Promise<void> {
    try {
        const hasCloud = await pullFromCloud();
        if (!hasCloud) {
            // クラウドが空 → localStorage の既存データをアップロード
            await pushAllToCloud();
        }
        syncReady = true;
        console.log("[Sync] Ready");
    } catch (e) {
        console.error("[Sync] Init failed:", e);
        syncReady = true; // オフラインでも動作を継続
    }
}

/**
 * 同期が有効かどうか
 */
export function isSyncReady(): boolean {
    return syncReady;
}
