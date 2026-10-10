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
  created_by?: string | null;
}

const CATEGORY_MAP: Record<string, { label: string; icon: string; badgeClass: string }> = {
  update: { label: "アップデート", icon: "🚀", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  notice: { label: "お知らせ", icon: "📢", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  event: { label: "イベント", icon: "🎉", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  maintenance: { label: "メンテ", icon: "🛠️", badgeClass: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const supabase = createClient();

  // 閉じた告知IDのセットをローカルストレージから取得
  const getDismissedIds = (): string[] => {
    try {
      const stored = localStorage.getItem("amu_dismissed_announcements");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  // 告知一覧の取得（常に作成日時が新しい順）
  const fetchAnnouncements = async () => {
    try {
      // ユーザーと管理者権限の確認
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .single();
        if (profile?.is_admin) {
          setIsAdmin(true);
        }
      }

      // 作成日時が新しい順で最大10件取得
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (!error && data && data.length > 0) {
        const dismissed = getDismissedIds();
        // まだ閉じていない告知をフィルタリング
        const unDismissed = (data as Announcement[]).filter((a) => !dismissed.includes(a.id));

        // もし全て閉じていても、管理者の場合は全件確認可能にするか、未読があれば未読を優先
        if (unDismissed.length > 0) {
          setAnnouncements(unDismissed);
        } else {
          // すべて閉じられている場合は非表示
          setAnnouncements([]);
        }
        setCurrentIndex(0);
      } else {
        setAnnouncements([]);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAnnouncements();

    // リアルタイム購読
    const channel = supabase
      .channel("announcement_banner_realtime_v2")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
        },
        () => {
          fetchAnnouncements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 現在の告知を閉じる（localStorageに保存して更新後も再表示されないようにする）
  const handleDismissCurrent = (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = announcements[currentIndex];
    if (!current) return;

    try {
      const dismissed = getDismissedIds();
      if (!dismissed.includes(current.id)) {
        dismissed.push(current.id);
        localStorage.setItem("amu_dismissed_announcements", JSON.stringify(dismissed));
      }
    } catch {
      // ignore
    }

    // 次の告知があれば切り替え、なければ非表示
    const remaining = announcements.filter((a) => a.id !== current.id);
    setAnnouncements(remaining);
    if (currentIndex >= remaining.length) {
      setCurrentIndex(Math.max(0, remaining.length - 1));
    }
  };

  // 管理者による告知の完全削除（DBから削除）
  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm("本当にこの告知を完全に削除しますか？\n（※すべてのユーザーの画面から消去されます）")) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) {
        alert("削除に失敗しました: " + error.message);
        return;
      }

      alert("🗑️ 告知を完全に削除しました。");
      setIsOpenModal(false);
      // 再取得
      await fetchAnnouncements();
    } catch (err: any) {
      alert("エラー: " + (err?.message || err));
    } finally {
      setIsDeleting(false);
    }
  };

  if (announcements.length === 0) return null;

  const current = announcements[currentIndex] || announcements[0];
  if (!current) return null;

  const cat = CATEGORY_MAP[current.category] || CATEGORY_MAP.update;

  return (
    <>
      <div className="mb-6 sm:mb-8 animate-fade-in">
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-pink-500/10 border border-indigo-200/90 p-3 sm:p-4 shadow-xs transition-all hover:border-indigo-300 hover:shadow-sm">
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
                {current.is_pinned && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                    固定 📌
                  </span>
                )}
              </div>

              {current.image_url && (
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg overflow-hidden shrink-0 border border-indigo-200 bg-white shadow-2xs">
                  <img src={current.image_url} alt="添付" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                  {current.title}
                </p>
              </div>

              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 shrink-0 group-hover:translate-x-0.5 transition-transform">
                詳細を見る →
              </span>
            </button>

            {/* ナビゲーション & 操作コントロール */}
            <div className="flex items-center gap-1 shrink-0">
              {/* 複数ある場合の前後切り替え */}
              {announcements.length > 1 && (
                <div className="flex items-center gap-1 mr-1 text-[11px] font-bold text-slate-500">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentIndex((prev) => (prev > 0 ? prev - 1 : announcements.length - 1));
                    }}
                    className="w-6 h-6 rounded-lg bg-white/80 hover:bg-white text-slate-600 border border-slate-200 flex items-center justify-center cursor-pointer transition-colors"
                    title="前のお知らせ"
                  >
                    ‹
                  </button>
                  <span className="text-[10px] px-1 text-slate-400">
                    {currentIndex + 1}/{announcements.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentIndex((prev) => (prev < announcements.length - 1 ? prev + 1 : 0));
                    }}
                    className="w-6 h-6 rounded-lg bg-white/80 hover:bg-white text-slate-600 border border-slate-200 flex items-center justify-center cursor-pointer transition-colors"
                    title="次のお知らせ"
                  >
                    ›
                  </button>
                </div>
              )}

              {/* 閉じるボタン（リロードしても非表示を維持） */}
              <button
                type="button"
                onClick={handleDismissCurrent}
                className="w-7 h-7 rounded-xl hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 flex items-center justify-center text-xs transition-colors shrink-0 cursor-pointer"
                title="このお知らせを非表示にする（再表示されません）"
              >
                ✕
              </button>
            </div>
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
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black px-3 py-1 rounded-full border ${cat.badgeClass} flex items-center gap-1.5`}>
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </span>
                {current.is_pinned && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                    固定 📌
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpenModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-snug mb-3">
              {current.title}
            </h3>

            <p className="text-[11px] font-bold text-slate-400 mb-4">
              配信日時: {new Date(current.created_at).toLocaleString("ja-JP", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>

            {/* 添付画像 */}
            {current.image_url && (
              <div className="mb-5 rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center max-h-80 shadow-sm">
                <img
                  src={current.image_url}
                  alt={current.title}
                  className="w-full h-auto max-h-80 object-contain cursor-pointer"
                  onClick={() => window.open(current.image_url!, "_blank")}
                  title="クリックして原寸大表示"
                />
              </div>
            )}

            {/* 本文 */}
            <div className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-5">
              {current.content}
            </div>

            {/* リンクURL */}
            {current.link_url && (
              <div className="mb-5">
                <a
                  href={current.link_url}
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

            {/* 管理者用削除ボタン */}
            {(isAdmin || (currentUser && currentUser.id === current.created_by)) && (
              <div className="mb-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">管理者操作</span>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteAnnouncement(current.id)}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>🗑️</span>
                  <span>{isDeleting ? "削除中..." : "この告知を完全に削除"}</span>
                </button>
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
