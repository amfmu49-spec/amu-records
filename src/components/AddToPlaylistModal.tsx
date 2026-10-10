"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

interface AddToPlaylistModalProps {
  song: {
    id: string;
    title: string;
    artist?: string;
    cover_url?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export default function AddToPlaylistModal({
  song,
  isOpen,
  onClose,
  currentUserId,
}: AddToPlaylistModalProps) {
  const supabase = createClient();
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [songInPlaylistIds, setSongInPlaylistIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 新規プレイリスト作成のステート
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIsPublic, setNewIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !song || !currentUserId) return;

    let isMounted = true;
    async function loadUserPlaylists() {
      setLoading(true);
      setMessage(null);
      try {
        // 1. ユーザーのプレイリスト一覧を取得
        const { data: userPlaylists, error: pError } = await supabase
          .from("playlists")
          .select("id, title, is_public, created_at, playlist_songs(song_id)")
          .eq("user_id", currentUserId)
          .order("created_at", { ascending: false });

        if (pError) throw pError;

        if (isMounted && userPlaylists) {
          setPlaylists(userPlaylists);

          // この曲が含まれているプレイリストIDのセットを作成
          const inPlaylists = new Set<string>();
          userPlaylists.forEach((p: any) => {
            const hasSong = p.playlist_songs?.some((ps: any) => ps.song_id === song?.id);
            if (hasSong) {
              inPlaylists.add(p.id);
            }
          });
          setSongInPlaylistIds(inPlaylists);
        }
      } catch (err: any) {
        console.error("Failed to load playlists:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadUserPlaylists();

    return () => {
      isMounted = false;
    };
  }, [isOpen, song, currentUserId]);

  if (!isOpen || !song) return null;

  // プレイリストへの追加/削除トグル
  const handleToggleSong = async (playlistId: string) => {
    if (!currentUserId || !song) return;
    setActionLoading(playlistId);
    setMessage(null);

    const isCurrentlyIn = songInPlaylistIds.has(playlistId);

    try {
      if (isCurrentlyIn) {
        // プレイリストから削除
        const { error } = await supabase
          .from("playlist_songs")
          .delete()
          .match({ playlist_id: playlistId, song_id: song.id });

        if (error) throw error;

        setSongInPlaylistIds((prev) => {
          const next = new Set(prev);
          next.delete(playlistId);
          return next;
        });
        setMessage("プレイリストから削除しました");
      } else {
        // プレイリストに追加
        // position は末尾にする
        const targetPlaylist = playlists.find((p) => p.id === playlistId);
        const currentCount = targetPlaylist?.playlist_songs?.length || 0;

        const { error } = await supabase.from("playlist_songs").insert([
          {
            playlist_id: playlistId,
            song_id: song.id,
            position: currentCount,
          },
        ]);

        if (error) throw error;

        setSongInPlaylistIds((prev) => {
          const next = new Set(prev);
          next.add(playlistId);
          return next;
        });
        setMessage("プレイリストに追加しました！");
      }
    } catch (err: any) {
      console.error("Toggle error:", err);
      alert("処理に失敗しました: " + (err.message || "エラー"));
    } finally {
      setActionLoading(null);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 新規プレイリスト作成して追加
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUserId || !song) return;

    setCreating(true);
    setMessage(null);

    try {
      // 1. プレイリストを作成
      const { data: newPlaylist, error: pError } = await supabase
        .from("playlists")
        .insert([
          {
            user_id: currentUserId,
            title: newTitle.trim(),
            description: newDescription.trim() || null,
            is_public: newIsPublic,
          },
        ])
        .select()
        .single();

      if (pError) throw pError;

      // 2. 作成したプレイリストに対象の曲を追加
      const { error: sError } = await supabase.from("playlist_songs").insert([
        {
          playlist_id: newPlaylist.id,
          song_id: song.id,
          position: 0,
        },
      ]);

      if (sError) throw sError;

      // ステートを更新
      setPlaylists((prev) => [{ ...newPlaylist, playlist_songs: [{ song_id: song.id }] }, ...prev]);
      setSongInPlaylistIds((prev) => {
        const next = new Set(prev);
        next.add(newPlaylist.id);
        return next;
      });

      // フォームリセット
      setNewTitle("");
      setNewDescription("");
      setShowCreateForm(false);
      setMessage(`「${newPlaylist.title}」を作成し、曲を追加しました！`);
    } catch (err: any) {
      console.error("Create playlist error:", err);
      alert("プレイリストの作成に失敗しました: " + (err.message || "エラー"));
    } finally {
      setCreating(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">プレイリストに追加</h3>
              <p className="text-xs text-slate-500 truncate max-w-[220px]">
                {song.title} {song.artist ? `• ${song.artist}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* トーストメッセージ */}
        {message && (
          <div className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-4 py-2 border-b border-emerald-100 text-center animate-pulse">
            {message}
          </div>
        )}

        {/* 未ログイン時の案内 */}
        {!currentUserId ? (
          <div className="p-8 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-700 mb-1">ログインが必要です</p>
            <p className="text-xs text-slate-500 mb-5 max-w-xs">
              プレイリストを作成したり曲を追加するには、アカウントにログインしてください。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
              閉じる
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* 新規プレイリスト作成ボタン / フォームトグル */}
            {!showCreateForm ? (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="w-full py-2.5 px-3.5 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                新しいプレイリストを作成
              </button>
            ) : (
              <form onSubmit={handleCreatePlaylist} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">新規プレイリスト作成</span>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-600"
                  >
                    キャンセル
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="プレイリスト名（例: ドライブ用BGM）"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  maxLength={50}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                />
                <textarea
                  placeholder="説明（任意）"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  maxLength={200}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white resize-none"
                />
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={newIsPublic}
                      onChange={(e) => setNewIsPublic(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                    />
                    <span>公開する（みんなに共有）</span>
                  </label>
                  <button
                    type="submit"
                    disabled={creating || !newTitle.trim()}
                    className="px-4 py-1.5 rounded-full bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 disabled:opacity-50 transition-all cursor-pointer active:scale-95"
                  >
                    {creating ? "作成中..." : "作成して追加"}
                  </button>
                </div>
              </form>
            )}

            {/* 既存のプレイリスト一覧 */}
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-bold text-slate-400 px-1 uppercase tracking-wider">
                あなたのプレイリスト
              </p>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  プレイリストを読み込み中...
                </div>
              ) : playlists.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                  まだプレイリストがありません。<br />
                  上のボタンから作成してみましょう！
                </div>
              ) : (
                playlists.map((playlist) => {
                  const isIn = songInPlaylistIds.has(playlist.id);
                  const isAction = actionLoading === playlist.id;

                  return (
                    <div
                      key={playlist.id}
                      onClick={() => !isAction && handleToggleSong(playlist.id)}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none active:scale-98 ${
                        isIn
                          ? "bg-indigo-50/60 border-indigo-200 text-indigo-900 shadow-2xs"
                          : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/80 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                            isIn
                              ? "bg-indigo-600 text-white shadow-xs"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {isIn ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`font-bold text-xs sm:text-sm truncate ${isIn ? "text-indigo-950" : "text-slate-800"}`}>
                            {playlist.title}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span>{playlist.is_public ? "🌐 公開" : "🔒 非公開"}</span>
                            <span>•</span>
                            <span>{playlist.playlist_songs?.length || 0}曲</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isAction ? (
                          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-all ${
                              isIn
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                            }`}
                          >
                            {isIn ? "追加済み" : "追加"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* フッター */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-full text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
}
