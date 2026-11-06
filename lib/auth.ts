import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getTeachers, saveTeacher, setCurrentTeacherId, getCurrentTeacherId } from "./storage";
import { Teacher } from "./types";

let _client: SupabaseClient | null = null;

export async function getSupabaseAuthClient(): Promise<SupabaseClient | null> {
    if (typeof window === "undefined") return null;
    if (_client) return _client;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const { createClient } = await import("@supabase/supabase-js");
    _client = createClient(url, key);
    return _client;
}

/** Googleでログイン (OAuth) */
export async function signInWithGoogle(redirectTo?: string): Promise<{ error?: any }> {
    const supabase = await getSupabaseAuthClient();
    if (!supabase) return { error: "Supabase client not available" };

    const redirect = redirectTo || (typeof window !== "undefined" ? window.location.origin : undefined);

    const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: redirect,
            queryParams: {
                access_type: "offline",
                prompt: "select_account",
            },
        },
    });

    return { error };
}

/** ログアウト */
export async function signOutUser(): Promise<void> {
    const supabase = await getSupabaseAuthClient();
    if (supabase) {
        await supabase.auth.signOut();
    }
    setCurrentTeacherId(null);
    if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("mobile_user_selected");
        sessionStorage.removeItem("_cloud_synced");
    }
}

/** 現在ログイン中のユーザーを取得 */
export async function getCurrentAuthUser(): Promise<User | null> {
    const supabase = await getSupabaseAuthClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user || null;
}

/**
 * 管理者（朝日恵梨菜さん）の判定
 * - Googleアカウントの名前が「朝日」または「Erina Asahi」等
 * - メールのローカル部に asahi または erina が含まれる
 * - nakae.lab の代表アドレス
 */
export function isUserAdmin(user: User | null): boolean {
    if (!user) return false;
    const email = (user.email || "").toLowerCase();
    const fullName = (user.user_metadata?.full_name || user.user_metadata?.name || "").toLowerCase();

    // 朝日恵梨菜さんの判定キーワード
    if (fullName.includes("朝日") || fullName.includes("erina") || fullName.includes("asahi")) {
        return true;
    }
    if (email.includes("asahi") || email.includes("erina") || email.includes("nakae.lab")) {
        return true;
    }

    return false;
}

/**
 * ログイン中ユーザーが既にいずれかの先生データに紐付いているかをチェック
 */
export function findTeacherByAuthUser(user: User): Teacher | undefined {
    // 管理者（朝日恵梨菜さん）の場合：
    // 特定の先生1人に固定せず、直近選択中の先生、または先頭の先生（中江先生）にアクセス可能
    if (isUserAdmin(user)) {
        const teachers = getTeachers();
        const currentId = getCurrentTeacherId();
        if (currentId) {
            const current = teachers.find(t => t.id === currentId);
            if (current) return current;
        }
        // 未選択なら先頭の先生をデフォルトとする
        return teachers[0];
    }

    const teachers = getTeachers();
    // 1. authUserId が一致
    let found = teachers.find(t => t.authUserId === user.id);
    if (found) return found;

    // 2. もし未設定だが email が完全一致する場合も自動紐付け
    if (user.email) {
        found = teachers.find(t => t.email && t.email.toLowerCase() === user.email?.toLowerCase());
        if (found) {
            // authUserId を補完して保存
            found.authUserId = user.id;
            saveTeacher(found);
            return found;
        }
    }

    return undefined;
}

/**
 * まだ誰にも紐付いていない（引き継ぎ可能な）先生一覧を取得
 */
export function getClaimableTeachers(): Teacher[] {
    const teachers = getTeachers();
    return teachers.filter(t => !t.authUserId);
}

/**
 * 既存の先生データに現在のログインユーザーを紐付ける
 */
export function claimTeacher(teacherId: string, user: User): Teacher | null {
    const teachers = getTeachers();
    const target = teachers.find(t => t.id === teacherId);
    if (!target) return null;

    target.authUserId = user.id;
    if (user.email) target.email = user.email;

    saveTeacher(target);
    setCurrentTeacherId(target.id);
    return target;
}

/**
 * 新規の先生を作成してログインユーザーに紐付ける
 */
export function createAndClaimTeacher(name: string, user: User): Teacher {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t_${Date.now()}`;
    const newTeacher: Teacher = {
        id,
        name: name.trim(),
        createdAt: new Date().toISOString(),
        authUserId: user.id,
        email: user.email,
    };

    saveTeacher(newTeacher);
    setCurrentTeacherId(newTeacher.id);
    return newTeacher;
}
