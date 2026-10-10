"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/utils/supabase/client";
import { v4 as uuidv4 } from "uuid";

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: "update" | "notice" | "event" | "maintenance" | string;
  image_url?: string | null;
  link_url?: string | null;
  is_pinned?: boolean;
  created_at: string;
  created_by?: string | null;
}

const CATEGORY_MAP: Record<string, { label: string; badgeClass: string; icon: string }> = {
  update: { label: "アップデート", badgeClass: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "🚀" },
  notice: { label: "お知らせ", badgeClass: "bg-blue-100 text-blue-700 border-blue-200", icon: "📢" },
  event: { label: "イベント", badgeClass: "bg-pink-100 text-pink-700 border-pink-200", icon: "🎉" },
  maintenance: { label: "メンテナンス", badgeClass: "bg-amber-100 text-amber-700 border-amber-200", icon: "🛠" },
};

export default function NotificationBell() {
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 一斉送信フォームの状態
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<"update" | "notice" | "event" | "maintenance">("update");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newIsPinned, setNewIsPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // パスコード認証の状態
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");

  const popoverRef = useRef<HTMLDivElement>(null);

  // お知らせ一覧の取得
  const fetchAnnouncements = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("お知らせの取得に失敗:", error);
        return;
      }

      const list: Announcement[] = data || [];
      setAnnouncements(list);

      // 未読チェック
      if (list.length > 0) {
        const lastSeenId = localStorage.getItem("amu_last_seen_announcement_id");
        if (!lastSeenId || lastSeenId !== list[0].id) {
          setHasUnread(true);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ユーザー及び管理者権限チェック
  useEffect(() => {
    async function checkUserAndAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

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
    }

    setMounted(true);
    checkUserAndAdmin();
    fetchAnnouncements();

    // Supabase Realtime サブスクリプションでお知らせの変更を即時反映
    const channel = supabase
      .channel("announcements_realtime")
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

  // ベルアイコンクリック時の挙動
  const handleToggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (nextState) {
      // ベルを開いた際に最新のお知らせを即座に再取得
      fetchAnnouncements();
      if (announcements.length > 0) {
        localStorage.setItem("amu_last_seen_announcement_id", announcements[0].id);
        setHasUnread(false);
      }
    }
  };

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 管理者による一斉送信
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      alert("タイトルと本文を入力してください");
      return;
    }

    try {
      setIsSubmitting(true);

      let finalImageUrl: string | null = null;
      if (newImageFile) {
        const ext = newImageFile.name.split('.').pop() || 'jpg';
        const filePath = `announcements/${uuidv4()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, newImageFile);

        if (uploadError) throw new Error("画像のアップロードに失敗しました");

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        finalImageUrl = publicUrl;
      }

      let insertPayload: any = {
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        link_url: newLinkUrl.trim() || null,
        is_pinned: newIsPinned,
        created_by: user?.id || null,
      };

      if (finalImageUrl) {
        insertPayload.image_url = finalImageUrl;
      }

      let { data, error } = await supabase
        .from("announcements")
        .insert([insertPayload])
        .select()
        .single();

      // DBに image_url カラムがまだ作成されていない場合のフォールバック（自動再試行）
      if (error && (error.message?.includes("image_url") || error.details?.includes("image_url") || error.code === "PGRST204")) {
        console.warn("Retrying announcement insert without image_url...");
        delete insertPayload.image_url;
        const retry = await supabase
          .from("announcements")
          .insert([insertPayload])
          .select()
          .single();
        data = retry.data;
        error = retry.error;
        if (!error) {
          alert("※お知らせは配信されましたが、画像カラム(image_url)がSupabaseに未反映のため画像は除外されました。SupabaseでマイグレーションSQLを実行してください。");
        }
      }

      if (error) {
        alert("配信に失敗しました: " + error.message);
        return;
      }

      alert("🎉 全ユーザーへお知らせを一斉配信しました！");
      setNewTitle("");
      setNewContent("");
      setNewImageFile(null);
      setNewImagePreview(null);
      setNewLinkUrl("");
      setNewIsPinned(false);
      setShowAdminForm(false);

      // 一覧を再取得
      await fetchAnnouncements();
    } catch (err: any) {
      alert("エラーが発生しました: " + (err?.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 管理者によるお知らせ削除
  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm("このお知らせを削除しますか？")) return;

    try {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) {
        alert("削除に失敗しました: " + error.message);
        return;
      }
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      alert("削除エラー: " + (err?.message || err));
    }
  };

  // パスコードで管理者権限を付与する簡易アクティベーション
  const handleActivateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    // 管理者パスコード（初期設定: amu2026）
    if (passcode.trim() !== "amu2026" && passcode.trim() !== "amurecords") {
      setPasscodeError("パスコードが正しくありません");
      return;
    }

    if (!user) {
      setPasscodeError("Googleでログインしてから実行してください");
      return;
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_admin: true })
        .eq("id", user.id);

      if (error) {
        setPasscodeError("権限更新に失敗しました: " + error.message);
        return;
      }

      setIsAdmin(true);
      setShowPasscodeModal(false);
      setPasscode("");
      setPasscodeError("");
      alert("👑 管理者権限（俺モード）が有効化されました！お知らせを一斉配信できます。");
    } catch (err: any) {
      setPasscodeError("エラー: " + (err?.message || err));
    }
  };

  // 日付フォーマット
  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffHours < 1) {
        const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
        return `${diffMins}分前`;
      }
      if (diffHours < 24) {
        return `${diffHours}時間前`;
      }
      if (diffHours < 24 * 7) {
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}日前`;
      }
      return d.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* 🔔 ベルボタン */}
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label="お知らせ"
        className={`relative p-2 sm:p-2.5 rounded-full transition-all active:scale-95 flex items-center justify-center cursor-pointer ${
          isOpen
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
            : hasUnread
              ? "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30"
              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80"
        }`}
      >
        <svg
          className={`w-4 h-4 sm:w-5 sm:h-5 ${hasUnread ? "animate-wiggle" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* 未読通知バッジ */}
        {hasUnread && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-[9px] font-black text-white items-center justify-center">
              !
            </span>
          </span>
        )}
      </button>

      {/* お知らせ中央モーダル（headerのbackdrop-filter等のcontaining blockを脱出するためcreatePortalを使用） */}
      {isOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85dvh] sm:max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🔔</span>
                <h3 className="font-bold text-base tracking-wide">お知らせ・アップデート</h3>
                {isAdmin && (
                  <span className="text-[10px] bg-amber-400 text-slate-900 font-extrabold px-2 py-0.5 rounded-full shadow-sm">
                    管理者
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="閉じる"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 管理者向け一斉配信ボタン */}
            {isAdmin && (
              <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-indigo-900">管理者メニュー</span>
                <button
                  type="button"
                  onClick={() => setShowAdminForm(!showAdminForm)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <span>{showAdminForm ? "✕ 閉じる" : "📣 お知らせを一斉配信"}</span>
                </button>
              </div>
            )}

            {/* 管理者向け一斉配信フォーム */}
            {isAdmin && showAdminForm && (
              <form onSubmit={handleCreateAnnouncement} className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0 overflow-y-auto max-h-[50vh]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800">新規お知らせ作成</span>
                  <span className="text-[10px] text-slate-500">全ユーザーへ即時届きます</span>
                </div>

                {/* カテゴリ選択 */}
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {(["update", "notice", "event", "maintenance"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCategory(cat)}
                      className={`py-2 px-1 rounded-xl font-bold text-[11px] transition-all text-center border ${
                        newCategory === cat
                          ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {CATEGORY_MAP[cat].icon} {CATEGORY_MAP[cat].label}
                    </button>
                  ))}
                </div>

                {/* タイトル */}
                <div>
                  <input
                    type="text"
                    placeholder="タイトル（例: 新機能を追加しました！）"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    required
                  />
                </div>

                {/* 本文 */}
                <div>
                  <textarea
                    placeholder="本文を入力（アップデート内容や詳細案内など）"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white h-24 resize-none leading-relaxed"
                    required
                  />
                </div>

                {/* 画像添付（任意） */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-700">添付画像（任意）</span>
                    {newImagePreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewImageFile(null);
                          setNewImagePreview(null);
                        }}
                        className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                      >
                        画像を削除
                      </button>
                    )}
                  </div>
                  {newImagePreview ? (
                    <div className="relative w-full h-28 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                      <img src={newImagePreview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-1.5 w-full py-2 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>画像を選択（ポスターやジャケットなど）</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const file = e.target.files[0];
                            setNewImageFile(file);
                            setNewImagePreview(URL.createObjectURL(file));
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* 詳細リンク（任意） */}
                <div>
                  <input
                    type="url"
                    placeholder="関連リンクURL（任意）"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>

                {/* ピン留めチェック */}
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newIsPinned}
                    onChange={(e) => setNewIsPinned(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="font-semibold">先頭にピン留めする 📌</span>
                </label>

                {/* 送信ボタン */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "配信中..." : "🚀 全ユーザーへ一斉配信する"}
                </button>
              </form>
            )}

            {/* お知らせリスト */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0">
              {isLoading ? (
                <div className="p-10 text-center text-xs text-slate-400">読み込み中...</div>
              ) : announcements.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400">現在お知らせはありません</div>
              ) : (
                announcements.map((item) => {
                  const catInfo = CATEGORY_MAP[item.category] || CATEGORY_MAP.notice;
                  return (
                    <div
                      key={item.id}
                      className={`p-4 sm:p-5 transition-colors hover:bg-slate-50/80 ${
                        item.is_pinned ? "bg-amber-50/30" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.is_pinned && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              📌 固定
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${catInfo.badgeClass}`}
                          >
                            <span>{catInfo.icon}</span>
                            <span>{catInfo.label}</span>
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                          {formatDate(item.created_at)}
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug mb-1.5">
                        {item.title}
                      </h4>

                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap mb-2.5">
                        {item.content}
                      </p>

                      {/* 添付画像 */}
                      {item.image_url && (
                        <div className="mb-3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 max-h-60 sm:max-h-72">
                          <img
                            src={item.image_url}
                            alt={item.title}
                            className="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => window.open(item.image_url!, "_blank")}
                            title="画像をクリックして原寸大表示"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        {item.link_url ? (
                          <a
                            href={item.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            詳細を見る →
                          </a>
                        ) : (
                          <div></div>
                        )}

                        {/* 管理者用削除ボタン */}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAnnouncement(item.id)}
                            className="text-xs text-rose-500 hover:text-rose-700 font-bold px-2 py-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            🗑 削除
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* フッター（管理者未設定時のアクティベーションリンク） */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span className="font-semibold">AMU RECORDS</span>
              {!isAdmin && user && (
                <button
                  type="button"
                  onClick={() => setShowPasscodeModal(true)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                >
                  👑 管理者認証
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 管理者パスコード認証モーダル */}
      {showPasscodeModal && mounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowPasscodeModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-bold text-slate-900 mb-2">👑 管理者（俺）の有効化</h4>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              お知らせを一斉送信するための管理者パスコードを入力してください。
            </p>
            <form onSubmit={handleActivateAdmin} className="space-y-3">
              <input
                type="password"
                placeholder="パスコードを入力"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              {passcodeError && (
                <p className="text-xs text-rose-600 font-medium">{passcodeError}</p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasscodeModal(false)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  認証する
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
