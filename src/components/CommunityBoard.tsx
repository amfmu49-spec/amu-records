"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import UserRoleBadge from "@/components/UserRoleBadge";
import Link from "next/link";

interface BoardPost {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: {
    id?: string;
    artist_name: string | null;
    avatar_url: string | null;
    role: string | null;
    is_admin?: boolean | null;
  } | null;
}

function formatRelativeTime(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "たった今";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}分前`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}時間前`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}日前`;
    return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function CommunityBoard() {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabase = createClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 投稿一覧の取得
  const fetchPosts = async () => {
    try {
      setErrorMessage(null);
      const { data, error } = await supabase
        .from("board_posts")
        .select(`
          id,
          user_id,
          content,
          created_at,
          profiles:profiles!fk_board_post_profile (
            id,
            artist_name,
            avatar_url,
            role,
            is_admin
          )
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        // テーブル未作成などの場合は静かに処理
        console.warn("Board fetch error:", error.message);
        setErrorMessage(error.message);
        return;
      }

      setPosts((data as any) || []);
    } catch (err: any) {
      console.warn("Board fetch exception:", err);
      setErrorMessage(err?.message || "データの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // 認証・ユーザー情報取得
  useEffect(() => {
    async function initUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, artist_name, avatar_url, role, is_admin")
          .eq("id", user.id)
          .single();

        if (profile) {
          setCurrentProfile(profile);
          setIsAdmin(!!profile.is_admin);
        }
      }
    }

    initUser();
    fetchPosts();

    // Supabase Realtime サブスクリプション
    const channel = supabase
      .channel("community_board_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "board_posts",
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 投稿送信ハンドラ
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      alert("投稿するにはログインが必要です。");
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) return;
    if (trimmed.length > 400) {
      alert("メッセージは400文字以内で入力してください。");
      return;
    }

    try {
      setIsSubmitting(true);
      const { error } = await supabase.from("board_posts").insert([
        {
          user_id: currentUser.id,
          content: trimmed,
        },
      ]);

      if (error) {
        alert("投稿に失敗しました: " + error.message);
        return;
      }

      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      // 再取得
      await fetchPosts();
    } catch (err: any) {
      alert("エラー: " + (err?.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 投稿削除ハンドラ (本人または管理者)
  const handleDeletePost = async (postId: string) => {
    if (!confirm("この投稿を削除しますか？")) return;

    try {
      const { error } = await supabase
        .from("board_posts")
        .delete()
        .eq("id", postId);

      if (error) {
        alert("削除に失敗しました: " + error.message);
        return;
      }

      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err: any) {
      alert("削除エラー: " + (err?.message || err));
    }
  };

  return (
    <section className="mt-12 sm:mt-16 pt-10 border-t border-slate-200/80">
      <div className="bg-white rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-10 border border-slate-200 shadow-xs">
        {/* ヘッダーエリア */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100/80 text-indigo-700 text-xs font-black tracking-wider uppercase mb-2">
              <span>💬</span>
              <span>COMMUNITY BOARD</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              コミュニティ掲示板
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              音楽クリエイターやリスナーと気軽に交流・コラボ募集・楽曲の感想をシェアしよう！
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={fetchPosts}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              title="最新に更新"
            >
              <span>🔄</span>
              <span>更新</span>
            </button>
            <span className="text-xs font-bold text-slate-400 bg-slate-100/80 px-2.5 py-1.5 rounded-xl border border-slate-200">
              全 {posts.length} 件
            </span>
          </div>
        </div>

        {/* 投稿フォームエリア */}
        <div className="mb-8">
          {currentUser ? (
            <form onSubmit={handleSubmit} className="bg-slate-50/80 rounded-2xl p-4 sm:p-5 border border-slate-200/90 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 border border-slate-300 shrink-0">
                  {currentProfile?.avatar_url ? (
                    <img src={currentProfile.avatar_url} alt="You" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-600">
                      👤
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {currentProfile?.artist_name || currentUser.user_metadata?.full_name || "名無しユーザー"}
                  </span>
                  {isAdmin && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-2xs">
                      👑 俺（管理者）
                    </span>
                  )}
                  {currentProfile?.role && !isAdmin && (
                    <UserRoleBadge role={currentProfile.role} size="xs" />
                  )}
                </div>
              </div>

              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="曲を聴いた感想や、コラボ募集、ちょっとしたつぶやきを投稿してみよう（最大400文字）..."
                rows={3}
                maxLength={400}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none transition-all"
                required
              />

              <div className="flex items-center justify-between mt-3 gap-2">
                <span className={`text-xs font-medium ${content.length > 380 ? "text-red-500 font-bold" : "text-slate-400"}`}>
                  {content.length} / 400文字
                </span>
                <button
                  type="submit"
                  disabled={isSubmitting || !content.trim()}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white text-xs font-black shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>送信中...</span>
                    </>
                  ) : (
                    <>
                      <span>💬</span>
                      <span>投稿する</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6 text-center">
              <p className="text-xs sm:text-sm font-bold text-slate-700 mb-1">
                掲示板に投稿するにはログインが必要です
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Googleアカウントでログインすると、感想の投稿やクリエイターとの交流ができます。
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all shadow-sm"
              >
                <span>🔑</span>
                <span>ログインして投稿する</span>
              </Link>
            </div>
          )}
        </div>

        {/* 投稿一覧エリア */}
        <div className="space-y-3.5">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 text-sm font-semibold flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></span>
              <span>掲示板を読み込み中...</span>
            </div>
          ) : errorMessage ? (
            <div className="py-8 px-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 text-xs text-center">
              <p className="font-bold mb-1">掲示板の読み込みについて</p>
              <p className="text-amber-700">
                データベースの準備中または同期中です。しばらく経ってから「更新」ボタンをお試しください。
              </p>
            </div>
          ) : posts.length === 0 ? (
            <div className="py-12 px-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-xl mx-auto mb-2">
                ✍️
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">まだ投稿がありません</p>
              <p className="text-xs text-slate-400">
                最初のメッセージを投稿して、AMU RECORDSの音楽コミュニティを盛り上げよう！
              </p>
            </div>
          ) : (
            posts.map((post) => {
              const isAuthor = currentUser?.id === post.user_id;
              const canDelete = isAuthor || isAdmin;
              const postProfile = post.profiles;
              const postIsAdmin = !!postProfile?.is_admin;

              return (
                <div
                  key={post.id}
                  className="group bg-slate-50/60 hover:bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 transition-all hover:border-slate-300 hover:shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    {/* 投稿者情報 */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-200 border border-slate-300 shrink-0">
                        {postProfile?.avatar_url ? (
                          <img
                            src={postProfile.avatar_url}
                            alt={postProfile.artist_name || "user"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
                            🎵
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                            {postProfile?.artist_name || "名無しユーザー"}
                          </span>
                          {postIsAdmin && (
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded-md bg-amber-500 text-white shadow-2xs">
                              👑 俺
                            </span>
                          )}
                          {postProfile?.role && !postIsAdmin && (
                            <UserRoleBadge role={postProfile.role} size="xs" />
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-slate-400">
                          {formatRelativeTime(post.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* 削除ボタン（本人または管理者） */}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeletePost(post.id)}
                        className="opacity-0 group-hover:opacity-100 sm:transition-opacity text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 text-xs font-semibold cursor-pointer"
                        title="投稿を削除"
                      >
                        🗑️ 削除
                      </button>
                    )}
                  </div>

                  {/* 本文 */}
                  <p className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed pl-1 sm:pl-11 break-words">
                    {post.content}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
