"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: "update" | "notice" | "event" | "maintenance";
  image_url?: string | null;
  link_url?: string | null;
  is_pinned?: boolean;
  created_at: string;
}

const CATEGORY_MAP: Record<string, { label: string; icon: string; badgeClass: string }> = {
  update: { label: "アップデート", icon: "🚀", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  notice: { label: "お知らせ", icon: "📢", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  event: { label: "イベント", icon: "🎉", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  maintenance: { label: "メンテ", icon: "🛠️", badgeClass: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function AnnouncementBanner() {
  const [latest, setLatest] = useState<Announcement | null>(null);
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const supabase = createClient();

  const fetchLatest = async () => {
    try {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setLatest(data[0] as Announcement);
      } else {
        setLatest(null);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchLatest();

    // リアルタイム購読
    const channel = supabase
      .channel("announcement_banner_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
        },
        () => {
          fetchLatest();
          setIsDismissed(false); // 新着時は再表示
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!latest || isDismissed) return null;

  const cat = CATEGORY_MAP[latest.category] || CATEGORY_MAP.update;

  return (
    <>
      <div className="mb-6 sm:mb-8 animate-fade-in">
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-pink-500/10 border border-indigo-200/80 p-3 sm:p-4 shadow-xs transition-all hover:border-indigo-300 hover:shadow-sm">
          <div className="flex items-center justify-between gap-3">
            {/* メイン情報エリア（クリックで詳細展開） */}
            <button
              type="button"
              onClick={() => setIsOpenModal(true)}
              className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 text-left flex-1 cursor-pointer"
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] sm:text-xs font-black px-2 sm:px-2.5 py-0.5 rounded-full border shadow-2xs flex items-center gap-1 ${cat.badgeClass}`}>
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </span>
                {latest.is_pinned && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                    固定 📌
                  </span>
                )}
              </div>

              {latest.image_url && (
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg overflow-hidden shrink-0 border border-indigo-200 bg-white shadow-2xs">
                  <img src={latest.image_url} alt="添付" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                  {latest.title}
                </p>
              </div>

              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 shrink-0 group-hover:translate-x-0.5 transition-transform">
                詳細を見る →
              </span>
            </button>

            {/* 閉じるボタン */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDismissed(true);
              }}
              className="w-7 h-7 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 flex items-center justify-center text-xs transition-colors shrink-0 cursor-pointer"
              title="バナーを非表示"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* お知らせ詳細モーダル */}
      {isOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-4">
              <span className={`text-xs font-black px-3 py-1 rounded-full border ${cat.badgeClass} flex items-center gap-1.5`}>
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpenModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-snug mb-3">
              {latest.title}
            </h3>

            <p className="text-[11px] font-bold text-slate-400 mb-4">
              配信日時: {new Date(latest.created_at).toLocaleString("ja-JP", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>

            {/* 添付画像 */}
            {latest.image_url && (
              <div className="mb-5 rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center max-h-72 shadow-sm">
                <img
                  src={latest.image_url}
                  alt={latest.title}
                  className="w-full h-auto max-h-72 object-contain"
                />
              </div>
            )}

            {/* 本文 */}
            <div className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-5">
              {latest.content}
            </div>

            {/* リンクURL */}
            {latest.link_url && (
              <div className="mb-5">
                <a
                  href={latest.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors"
                >
                  <span>🔗</span>
                  <span className="truncate">関連リンクを開く</span>
                  <span>→</span>
                </a>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsOpenModal(false)}
              className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
