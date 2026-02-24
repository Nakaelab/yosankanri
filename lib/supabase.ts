import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ブラウザ環境かつ環境変数が揃っている場合のみクライアントを作成する関数
const createSupabaseClient = (): SupabaseClient | null => {
    // サーバーサイド（ビルド時など）では null を返す
    if (typeof window === "undefined") return null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 環境変数が1つでも欠けている場合は null を返す
    if (!url || !key || url === "" || key === "") {
        console.warn("Supabase credentials missing. Sync will be disabled.");
        return null;
    }

    try {
        return createClient(url, key);
    } catch (e) {
        console.error("Failed to initialize Supabase client:", e);
        return null;
    }
};

export const supabase = createSupabaseClient();
