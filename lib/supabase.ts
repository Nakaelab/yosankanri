import { createClient, SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
    // すでに作成済みの場合はそれを返す
    if (clientInstance) return clientInstance;

    // サーバーサイド（ビルド時）は絶対に何もしない
    if (typeof window === "undefined") return null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 環境変数が揃っていない場合も何もしない
    if (!url || !key) {
        return null;
    }

    try {
        clientInstance = createClient(url, key);
        return clientInstance;
    } catch (e) {
        console.error("Supabase init error:", e);
        return null;
    }
};
