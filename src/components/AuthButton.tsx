"use client";

import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useState } from "react";
import NotificationBell from "@/components/NotificationBell";

export default function AuthButton({ user }: { user: User | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      });
      if (error) {
        alert("ログインに失敗しました: " + error.message);
        setLoading(false);
      }
    } catch (err: any) {
      alert("ログインエラー: " + (err?.message || err));
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <div className="flex items-center gap-2 sm:gap-2.5">
        <NotificationBell />
        <div className="flex flex-col gap-1 items-stretch shrink-0">
          <Link 
            href="/profile" 
            className="text-[11px] sm:text-xs font-bold text-center text-slate-900 bg-slate-100 hover:bg-slate-200 active:scale-95 px-3 py-1 rounded-md transition-all shrink-0 shadow-2xs whitespace-nowrap"
          >
            マイページ
          </Link>
          <button 
            type="button"
            onClick={handleLogout} 
            disabled={loading}
            className="bg-white hover:bg-slate-50 active:scale-95 text-slate-500 hover:text-slate-800 px-3 py-0.5 rounded-md transition-all text-[10px] sm:text-[11px] font-medium border border-slate-200 shadow-2xs shrink-0 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <NotificationBell />
      <button 
        type="button"
        onClick={handleLogin} 
        disabled={loading}
        className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-full transition-all text-xs sm:text-sm font-semibold shadow-md flex items-center gap-2 shrink-0 disabled:opacity-50 select-none cursor-pointer whitespace-nowrap"
      >
        {loading ? "接続中..." : "Googleでログイン"}
      </button>
    </div>
  );
}
