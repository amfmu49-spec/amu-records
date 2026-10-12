"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { toCdnUrl } from "@/utils/cdn";
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

export interface PersonalNotification {
  id: string;
  user_id: string;
  actor_id: string;
  song_id: string;
  type: "like" | "comment" | "reply";
  content?: string | null;
  is_read: boolean;
  created_at: string;
  actor?: {
    id: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  song?: {
    id: string;
    title: string;
    cover_url?: string | null;
  } | null;
}

const CATEGORY_MAP: Record<string, { label: string; badgeClass: string; icon: string }> = {
  update: { label: "アップデート", badgeClass: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "🚀" },
  notice: { label: "お知らせ", badgeClass: "bg-blue-100 text-blue-700 border-blue-200", icon: "📢" },
  event: { label: "イベント", badgeClass: "bg-pink-100 text-pink-700 border-pink-200", icon: "🎉" },
  maintenance: { label: "メンテナンス", badgeClass: "bg-amber-100 text-amber-700 border-amber-200", icon: "🛠" },
};

export default function NotificationBell() {
  const router = useRouter();
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"personal" | "announcements">("personal");

  // 全体お知らせ
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [hasAnnouncementUnread, setHasAnnouncementUnread] = useState(false);

  // 個人宛て通知
  const [personalNotifications, setPersonalNotifications] = useState<PersonalNotification[]>([]);
  const [unreadPersonalCount, setUnreadPersonalCount] = useState(0);

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
          setHasAnnouncementUnread(true);
        }
      }
    } catch (err) {
      console.warn("fetchAnnouncements error:", err);
    }
  };

  // 個人宛て通知の取得
  const fetchPersonalNotifications = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select(`
          id,
          user_id,
          actor_id,
          song_id,
          type,
          content,
          is_read,
          created_at,
          actor:profiles!actor_id(id, display_name, avatar_url),
          song:songs!song_id(id, title, cover_url)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);

      if (error) {
        // テーブル未作成時などのエラーを安全に無視
        console.warn("通知テーブル取得スキップ (未マイグレーション等の可能性):", error.message);
        return;
      }

      const list: PersonalNotification[] = (data as any) || [];
      setPersonalNotifications(list);
      const unread = list.filter((n) => !n.is_read).length;
      setUnreadPersonalCount(unread);

      // 未読がある場合は初期タブを「あなた宛て」にする
      if (unread > 0) {
        setActiveTab("personal");
      }
    } catch (err) {
      console.warn("fetchPersonalNotifications error:", err);
    }
  };

  // ユーザー及び管理者権限チェック
  useEffect(() => {
    async function checkUserAndData() {
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

        await fetchPersonalNotifications(user.id);
      } else {
        // 未ログイン時は全体お知らせタブをデフォルトに
        setActiveTab("announcements");
      }

      await fetchAnnouncements();
    }

    setMounted(true);
    checkUserAndData();

    // Supabase Realtime サブスクリプションでお知らせの変更を即時反映
    const annChannel = supabase
      .channel("announcements_realtime_bell")
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
      supabase.removeChannel(annChannel);
    };
  }, []);

  // 個人宛て通知の Realtime 監視（ログイン時のみ）
  useEffect(() => {
    if (!user) return;

    const notifChannel = supabase
      .channel(`personal_notifications_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPersonalNotifications(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [user]);

  // ベルアイコンクリック時の挙動
  const handleToggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    if (nextState) {
      // ベルを開いた際に最新データを即座に再取得
      if (user) {
        fetchPersonalNotifications(user.id);
      }
      fetchAnnouncements();

      if (activeTab === "announcements" && announcements.length > 0) {
        localStorage.setItem("amu_last_seen_announcement_id", announcements[0].id);
        setHasAnnouncementUnread(false);
      }
    }
  };

  // タブ切り替え時の未読処理
  const handleTabChange = (tab: "personal" | "announcements") => {
    setActiveTab(tab);
    if (tab === "announcements" && announcements.length > 0) {
      localStorage.setItem("amu_last_seen_announcement_id", announcements[0].id);
      setHasAnnouncementUnread(false);
    }
  };

  // 個人通知をすべて既読にする
  const handleMarkAllPersonalAsRead = async () => {
    if (!user || unreadPersonalCount === 0) return;

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (!error) {
        setPersonalNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true }))
        );
        setUnreadPersonalCount(0);
      }
    } catch (err) {
      console.error("既読更新エラー:", err);
    }
  };

  // 個人通知クリック時の挙動（既読にして該当曲へ遷移）
  const handleNotificationClick = async (notif: PersonalNotification) => {
    if (!notif.is_read) {
      // 既読に更新
      supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notif.id)
        .then();

      setPersonalNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadPersonalCount((prev) => Math.max(0, prev - 1));
    }

    setIsOpen(false);

    if (notif.song_id) {
      router.push(`/song/${notif.song_id}`);
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
      alert("エラーが発生しました: " + err.message);
    }
  };

  // 管理者パスコード認証
  const handleActivateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeError("");

    if (!user) {
      setPasscodeError("ログインしてください");
      return;
    }

    if (passcode.trim() === "0901") {
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ is_admin: true })
          .eq("id", user.id);

        if (error) {
          setPasscodeError("更新に失敗しました: " + error.message);
          return;
        }

        setIsAdmin(true);
        setShowPasscodeModal(false);
        setPasscode("");
        alert("🎉 管理者権限を有効化しました！お知らせの一斉送信と削除が可能です。");
      } catch (err: any) {
        setPasscodeError("エラー: " + err.message);
      }
    } else {
      setPasscodeError("パスコードが正しくありません");
    }
  };

  // 画像プレビュー選択
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("画像サイズは5MB以下にしてください");
        return;
      }
      setNewImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 相対日時のフォーマット
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

  // 未読の総合判定
  const totalUnreadCount = unreadPersonalCount + (hasAnnouncementUnread ? 1 : 0);
  const isBellActive = totalUnreadCount > 0;

  return (
    <div className="relative" ref={popoverRef}>
      {/* 🔔 ベルボタン */}
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label="お知らせ・通知"
        className={`relative p-2 sm:p-2.5 rounded-full transition-all active:scale-95 flex items-center justify-center cursor-pointer ${
          isOpen
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
            : isBellActive
              ? "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30"
              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80"
        }`}
      >
        <svg
          className={`w-4 h-4 sm:w-5 sm:h-5 ${isBellActive ? "animate-wiggle" : ""}`}
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
        {isBellActive && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 min-w-4 px-1 bg-rose-500 text-[9px] font-black text-white items-center justify-center shadow-xs">
              {unreadPersonalCount > 0 ? (unreadPersonalCount > 9 ? "9+" : unreadPersonalCount) : "!"}
            </span>
          </span>
        )}
      </button>

      {/* お知らせ・通知中央モーダル */}
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
                <h3 className="font-bold text-base tracking-wide">通知とお知らせ</h3>
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

            {/* タブ切り替えバー */}
            <div className="p-2 bg-slate-100/80 border-b border-slate-200 flex gap-1.5 shrink-0">
              {user && (
                <button
                  type="button"
                  onClick={() => handleTabChange("personal")}
                  className={`flex-1 py-2 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === "personal"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>💌 あなた宛て</span>
                  {unreadPersonalCount > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                      {unreadPersonalCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleTabChange("announcements")}
                className={`flex-1 py-2 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "announcements"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>📢 運営お知らせ</span>
                {hasAnnouncementUnread && (
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                )}
              </button>
            </div>

            {/* 管理者向け一斉配信ボタン（お知らせタブのみ） */}
            {isAdmin && activeTab === "announcements" && (
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
            {isAdmin && showAdminForm && activeTab === "announcements" && (
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
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {CATEGORY_MAP[cat].icon} {CATEGORY_MAP[cat].label}
                    </button>
                  ))}
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="お知らせタイトル"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    required
                  />
                </div>

                <div>
                  <textarea
                    placeholder="本文を入力してください..."
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={3}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white resize-none"
                    required
                  />
                </div>

                {/* 画像添付 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    画像添付（任意）
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300 cursor-pointer"
                  />
                  {newImagePreview && (
                    <div className="mt-2 relative rounded-xl overflow-hidden max-h-36 border border-slate-200 bg-slate-100">
                      <img src={newImagePreview} alt="プレビュー" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setNewImageFile(null);
                          setNewImagePreview(null);
                        }}
                        className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-black text-white text-[10px] px-2 py-0.5 rounded-full"
                      >
                        ✕ 削除
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <input
                    type="url"
                    placeholder="リンク先URL（任意 例: https://...）"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_pinned"
                    checked={newIsPinned}
                    onChange={(e) => setNewIsPinned(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <label htmlFor="is_pinned" className="text-xs font-bold text-slate-700 cursor-pointer">
                    📌 最上部に固定表示する
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-98 text-white text-xs font-black transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "配信中..." : "🚀 この内容で全ユーザーに一斉配信"}
                </button>
              </form>
            )}

            {/* コンテンツエリア */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {activeTab === "personal" ? (
                /* 💌 あなた宛ての通知タブ */
                <div>
                  {/* サブヘッダー（未読一括処理など） */}
                  <div className="px-5 py-2.5 bg-slate-50/80 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">
                      楽曲へのいいねやコメント
                    </span>
                    {unreadPersonalCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllPersonalAsRead}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                      >
                        ✓ すべて既読にする
                      </button>
                    )}
                  </div>

                  {personalNotifications.length === 0 ? (
                    <div className="p-12 text-center space-y-2">
                      <div className="text-3xl">💌</div>
                      <p className="text-sm font-bold text-slate-700">まだ通知はありません</p>
                      <p className="text-xs text-slate-400">
                        あなたの楽曲にいいねやコメントがつくと、ここに通知が届きます！
                      </p>
                    </div>
                  ) : (
                    personalNotifications.map((notif) => {
                      const actorName = notif.actor?.display_name || "名無しのリスナー";
                      const actorAvatar = notif.actor?.avatar_url ? toCdnUrl(notif.actor.avatar_url) : null;
                      const songTitle = notif.song?.title || "あなたの楽曲";
                      const songCover = notif.song?.cover_url ? toCdnUrl(notif.song.cover_url) : null;

                      return (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-4 transition-all hover:bg-slate-50 cursor-pointer flex items-start gap-3 relative ${
                            !notif.is_read ? "bg-indigo-50/40" : ""
                          }`}
                        >
                          {/* 未読インジケーター */}
                          {!notif.is_read && (
                            <div className="absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                          )}

                          {/* アクターアバター */}
                          <div className="relative shrink-0">
                            {actorAvatar ? (
                              <img
                                src={actorAvatar}
                                alt={actorName}
                                className="w-10 h-10 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-black shadow-xs">
                                {actorName.slice(0, 1).toUpperCase()}
                              </div>
                            )}

                            {/* タイプ別ミニバッジ */}
                            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs shadow-xs bg-white border border-slate-100">
                              {notif.type === "like" ? "❤️" : notif.type === "comment" ? "💬" : "↩️"}
                            </span>
                          </div>

                          {/* 通知メッセージ本文 */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm text-slate-800 leading-snug">
                              <span className="font-extrabold text-slate-900">{actorName}</span>
                              {notif.type === "like" ? (
                                <span> さんがあなたの曲「<b className="text-indigo-600">{songTitle}</b>」にいいねしました！</span>
                              ) : notif.type === "comment" ? (
                                <span> さんがあなたの曲「<b className="text-indigo-600">{songTitle}</b>」にコメントしました</span>
                              ) : (
                                <span> さんがあなたのコメントに返信しました</span>
                              )}
                            </p>

                            {/* コメント抜粋 */}
                            {notif.content && (
                              <p className="mt-1 text-xs text-slate-600 bg-slate-100/80 rounded-xl px-2.5 py-1.5 border border-slate-200/60 line-clamp-2">
                                “{notif.content}”
                              </p>
                            )}

                            <span className="text-[10px] text-slate-400 mt-1 block">
                              {formatDate(notif.created_at)}
                            </span>
                          </div>

                          {/* 曲のサムネイル */}
                          {songCover && (
                            <img
                              src={songCover}
                              alt={songTitle}
                              className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-200/80 shadow-2xs"
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* 📢 運営お知らせタブ */
                <div>
                  {announcements.length === 0 ? (
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
              )}
            </div>

            {/* フッター */}
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
