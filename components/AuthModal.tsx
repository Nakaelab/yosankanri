"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { signInWithGoogle, getClaimableTeachers, claimTeacher, createAndClaimTeacher, signOutUser } from "@/lib/auth";
import { Teacher } from "@/lib/types";

interface AuthModalProps {
    authUser: User | null;
    onComplete: () => void;
}

export default function AuthModal({ authUser, onComplete }: AuthModalProps) {
    const [signingIn, setSigningIn] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    // 引き継ぎ・新規作成画面のステート
    const [selectedMode, setSelectedMode] = useState<"claim" | "create" | null>(null);
    const [claimableTeachers, setClaimableTeachers] = useState<Teacher[]>(() => getClaimableTeachers());
    const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
    const [newTeacherName, setNewTeacherName] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Google ログイン処理
    const handleGoogleSignIn = async () => {
        setSigningIn(true);
        setLoginError(null);
        try {
            const { error } = await signInWithGoogle();
            if (error) {
                console.error("Sign in error:", error);
                setLoginError(error.message || "ログインに失敗しました");
                setSigningIn(false);
            }
        } catch (err: any) {
            console.error("Sign in exception:", err);
            setLoginError("ログイン処理中にエラーが発生しました");
            setSigningIn(false);
        }
    };

    // 既存データの引き継ぎ完了
    const handleClaim = () => {
        if (!authUser || !selectedTeacherId || submitting) return;
        setSubmitting(true);
        const claimed = claimTeacher(selectedTeacherId, authUser);
        if (claimed) {
            onComplete();
        } else {
            alert("引き継ぎに失敗しました。もう一度お試しください。");
            setSubmitting(false);
        }
    };

    // 新規先生として開始
    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!authUser || !newTeacherName.trim() || submitting) return;
        setSubmitting(true);
        createAndClaimTeacher(newTeacherName.trim(), authUser);
        onComplete();
    };

    // ログアウトして別アカウントでやり直す
    const handleSignOut = async () => {
        await signOutUser();
        window.location.reload();
    };

    // ----------------------------------------------------------------------
    // 1. 未ログイン状態：Googleでログイン画面
    // ----------------------------------------------------------------------
    if (!authUser) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-100">
                    <div className="px-8 pt-10 pb-8 text-center">
                        <div className="w-16 h-16 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                            <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight mb-2">研究費 予算管理システム</h1>
                        <p className="text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
                            Googleアカウント（大学Gmailまたは個人のGmail）でログインしてご利用ください
                        </p>
                    </div>

                    <div className="px-8 pb-10 space-y-4">
                        {loginError && (
                            <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-600 rounded-xl">
                                {loginError}
                            </div>
                        )}

                        <button
                            onClick={handleGoogleSignIn}
                            disabled={signingIn}
                            className="w-full py-3.5 px-4 bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 rounded-2xl text-sm font-bold text-gray-700 shadow-sm transition-all flex items-center justify-center gap-3 group active:scale-[0.99] disabled:opacity-50"
                        >
                            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            <span>{signingIn ? "Google認証中..." : "Googleでログイン"}</span>
                        </button>

                        <div className="pt-2 text-center">
                            <span className="text-[11px] text-gray-400">
                                認証情報は安全に暗号化され保護されます
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------------
    // 2. ログイン済みだが、どの先生データにも未紐付け（初回設定画面）
    // ----------------------------------------------------------------------
    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-in border border-gray-100 flex flex-col max-h-[90vh]">
                <div className="px-6 py-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider">初期アカウント連携</div>
                        <h2 className="text-lg font-black text-gray-900 mt-0.5">利用する研究費スペースの選択</h2>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="text-xs text-gray-400 hover:text-gray-600 font-medium underline"
                        title="別のアカウントでログインし直す"
                    >
                        別のアカウント
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
                    <div className="flex items-center gap-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center flex-shrink-0 text-sm">
                            {authUser.email ? authUser.email[0].toUpperCase() : "G"}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-xs text-indigo-900 font-bold truncate">
                                {authUser.user_metadata?.full_name || authUser.email}
                            </div>
                            <div className="text-[10px] text-indigo-500 truncate">{authUser.email}</div>
                        </div>
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed">
                        このGoogleアカウントに紐付ける研究費データを選択してください。
                        {claimableTeachers.length > 0 && "すでに登録されているデータがある場合は引き継ぐことができます。"}
                    </p>

                    {/* 既存データの引き継ぎ選択肢（中江先生・小池さんなど、未紐付けの先生だけ表示） */}
                    {claimableTeachers.length > 0 && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-700">
                                ① 既存のデータを引き継ぐ（初回のみ選択可能）
                            </label>
                            <div className="space-y-2">
                                {claimableTeachers.map(t => {
                                    const isSelected = selectedTeacherId === t.id && selectedMode === "claim";
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedMode("claim");
                                                setSelectedTeacherId(t.id);
                                            }}
                                            className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 ${
                                                isSelected
                                                    ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-400/30 shadow-sm"
                                                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0 ${
                                                isSelected ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"
                                            }`}>
                                                {t.name[0]}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-gray-900 text-sm">{t.name}</div>
                                                <div className="text-[11px] text-gray-400">これまでの予算・執行明細を引き継ぐ</div>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                                                isSelected ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300"
                                            }`}>
                                                {isSelected && (
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                                    </svg>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 新規登録セクション */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                        <label className="block text-xs font-bold text-gray-700">
                            {claimableTeachers.length > 0 ? "② または、新しく研究費スペースを作成する" : "研究費スペースを作成する"}
                        </label>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedMode("create");
                                setSelectedTeacherId("");
                            }}
                            className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center gap-3.5 ${
                                selectedMode === "create"
                                    ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-400/30 shadow-sm"
                                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                            }`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0 ${
                                selectedMode === "create" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"
                            }`}>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-gray-900 text-sm">新規ユーザーとして登録</div>
                                <div className="text-[11px] text-gray-400">新しい名前でゼロから管理を開始する</div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                                selectedMode === "create" ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300"
                            }`}>
                                {selectedMode === "create" && (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                    </svg>
                                )}
                            </div>
                        </button>

                        {selectedMode === "create" && (
                            <form onSubmit={handleCreate} className="p-4 bg-gray-50 rounded-2xl space-y-3 mt-2 border border-gray-200 animate-slide-in">
                                <label className="block text-xs font-bold text-gray-600">お名前（先生のお名前など）</label>
                                <input
                                    type="text"
                                    required
                                    className="form-input text-sm w-full"
                                    placeholder="例: 山田 太郎"
                                    value={newTeacherName}
                                    onChange={(e) => setNewTeacherName(e.target.value)}
                                    autoFocus
                                />
                            </form>
                        )}
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3 flex-shrink-0">
                    {selectedMode === "claim" ? (
                        <button
                            type="button"
                            disabled={!selectedTeacherId || submitting}
                            onClick={handleClaim}
                            className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50"
                        >
                            {submitting ? "紐付け中..." : "このデータを引き継いで開始"}
                        </button>
                    ) : selectedMode === "create" ? (
                        <button
                            type="button"
                            disabled={!newTeacherName.trim() || submitting}
                            onClick={handleCreate}
                            className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50"
                        >
                            {submitting ? "作成中..." : "新規登録して開始"}
                        </button>
                    ) : (
                        <div className="text-xs text-gray-400">上記から選択してください</div>
                    )}
                </div>
            </div>
        </div>
    );
}
