"use client";

import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { getCurrentTeacher, setCurrentTeacherId } from "@/lib/storage";
import { Teacher } from "@/lib/types";

const NAV_ITEMS = [
    {
        href: "/",
        label: "ダッシュボード",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
        ),
    },
    {
        href: "/import",
        label: "執行登録",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
        ),
    },
    {
        href: "/transactions",
        label: "執行一覧",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
        ),
    },
    {
        href: "/budgets",
        label: "予算設定",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
        ),
    },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);

        // Fetch current teacher
        const t = getCurrentTeacher();
        setCurrentTeacher(t || (localStorage.getItem("budget_app_current_teacher") === "default" ? { id: "default", name: "メインユーザー", createdAt: "" } : null));

        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Close sidebar on route change (mobile)
    useEffect(() => {
        if (isMobile) setSidebarOpen(false);
    }, [pathname, isMobile]);

    const handleSwitchUser = () => {
        if (confirm("利用者を切り替えますか？")) {
            setCurrentTeacherId(null);
            window.location.href = "/";
        }
    };

    return (
        <html lang="ja">
            <head>
                <title>予算管理 | Budget Manager</title>
                <meta name="description" content="研究費予算管理アプリケーション" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </head>
            <body>
                {/* Mobile Hamburger Button */}
                {isMobile && (
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label="メニュー"
                    >
                        {sidebarOpen ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        )}
                    </button>
                )}

                {/* Sidebar Overlay (mobile only) */}
                {isMobile && (
                    <div
                        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar */}
                <aside className={`sidebar ${isMobile && sidebarOpen ? "open" : ""}`}>
                    <Link href="/" className="sidebar-logo cursor-pointer hover:opacity-80 transition-opacity">
                        <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                        </div>
                        <span className="text-base">予算管理</span>
                    </Link>

                    <nav className="sidebar-nav">
                        <div className="px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                            メニュー
                        </div>
                        {NAV_ITEMS.map((item) => {
                            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`sidebar-link relative ${isActive ? "active" : ""}`}
                                    onClick={() => isMobile && setSidebarOpen(false)}
                                >
                                    {item.icon}
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-auto border-t border-slate-700/50 p-4">
                        {currentTeacher ? (
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                                    {currentTeacher.name[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-slate-200 truncate">{currentTeacher.name}</div>
                                    <div className="text-[10px] text-slate-500 truncate">ログイン中</div>
                                </div>
                            </div>
                        ) : (
                            <div className="px-1 py-2 text-[10px] text-slate-500 text-center mb-2">
                                未選択
                            </div>
                        )}

                        <button
                            onClick={handleSwitchUser}
                            className="w-full py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition-colors flex items-center justify-center gap-2"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                            </svg>
                            利用者を切り替え
                        </button>
                    </div>

                    <div className="px-5 py-3 border-t border-slate-700/50 text-[10px] text-slate-500 text-center">
                        LocalStorage保存
                    </div>
                </aside>

                {/* Main */}
                <main className="main-content">{children}</main>
            </body>
        </html>
    );
}
