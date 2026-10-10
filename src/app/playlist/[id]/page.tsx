"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAudioPlayer } from "@/components/AudioPlayerProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UserRoleBadge from "@/components/UserRoleBadge";

export default function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const { playSong, currentSong, isPlaying } = useAudioPlayer();

  const [playlist, setPlaylist] = useState<any>(null);
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  // 編集用ステート
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPlaylistData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id);

      // プレイリスト詳細と作成者プロフィール
      const { data: pData, error: pError } = await supabase
        .from("playlists")
        .select(`
          id,
          title,
          description,
          is_public,
          user_id,
          created_at,
          profiles:profiles!fk_playlist_profile (
            id,
            artist_name,
            avatar_url,
            role
          )
        `)
        .eq("id", id)
        .single();

      if (pError || !pData) {
        console.error("Playlist fetch error:", pError);
        setPlaylist(null);
        return;
      }

      setPlaylist(pData);
      setEditTitle(pData.title);
      setEditDescription(pData.description || "");
      setEditIsPublic(pData.is_public);

      // プレイリスト内の楽曲
      const { data: sData, error: sError } = await supabase
        .from("playlist_songs")
        .select(`
          id,
          position,
          songs:songs!fk_playlist_song (
            id,
            title,
            artist,
            file_url,
            cover_url,
            play_count,
            user_id,
            profiles:profiles!fk_user_profile (
              id,
              artist_name,
              avatar_url,
              role
            ),
            co_artist_1:profiles!songs_co_artist_id_1_fkey (
              id,
              artist_name,
              avatar_url,
              role
            ),
            co_artist_2:profiles!songs_co_artist_id_2_fkey (
              id,
              artist_name,
              avatar_url,
              role
            )
          )
        `)
        .eq("playlist_id", id)
        .order("position", { ascending: true });

      if (sError) {
        console.error("Playlist songs error:", sError);
      } else {
        const mappedSongs = (sData || [])
          .map((item: any) => item.songs)
          .filter(Boolean);
        setSongs(mappedSongs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlaylistData();
  }, [id]);

  const isOwner = currentUserId && playlist && playlist.user_id === currentUserId;

  // 全曲再生
  const handlePlayAll = (shuffle: boolean = false) => {
    if (songs.length === 0) return;
    let listToPlay = [...songs];
    if (shuffle) {
      listToPlay = listToPlay.sort(() => Math.random() - 0.5);
    }
    const firstSong = listToPlay[0];
    const artistName = firstSong.profiles?.artist_name || firstSong.artist || "Unknown Artist";
    playSong(
      {
        id: firstSong.id,
        title: firstSong.title,
        file_url: firstSong.file_url,
        cover_url: firstSong.cover_url,
        artist: artistName,
      },
      listToPlay
    );
  };

  // 1曲再生
  const handlePlaySingle = (song: any) => {
    const artistName = song.profiles?.artist_name || song.artist || "Unknown Artist";
    playSong(
      {
        id: song.id,
        title: song.title,
        file_url: song.file_url,
        cover_url: song.cover_url,
        artist: artistName,
      },
      songs
    );
  };

  // プレイリストから曲を削除
  const handleRemoveSong = async (songId: string) => {
    if (!isOwner) return;
    if (!confirm("この曲をプレイリストから削除しますか？")) return;

    try {
      const { error } = await supabase
        .from("playlist_songs")
        .delete()
        .match({ playlist_id: id, song_id: songId });

      if (error) throw error;
      setSongs((prev) => prev.filter((s) => s.id !== songId));
    } catch (err: any) {
      alert("削除に失敗しました: " + (err.message || "エラー"));
    }
  };

  // プレイリストの更新（タイトル・説明・公開状態）
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || !editTitle.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("playlists")
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          is_public: editIsPublic,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      setPlaylist((prev: any) => ({
        ...prev,
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        is_public: editIsPublic,
      }));
      setIsEditing(false);
    } catch (err: any) {
      alert("更新に失敗しました: " + (err.message || "エラー"));
    } finally {
      setSaving(false);
    }
  };

  // プレイリスト削除
  const handleDeletePlaylist = async () => {
    if (!isOwner) return;
    if (!confirm("このプレイリストを完全に削除してもよろしいですか？（元に戻せません）")) return;

    try {
      const { error } = await supabase.from("playlists").delete().eq("id", id);
      if (error) throw error;
      alert("プレイリストを削除しました");
      router.push("/profile");
    } catch (err: any) {
      alert("削除に失敗しました: " + (err.message || "エラー"));
    }
  };

  // リンクコピー
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt("以下のURLをコピーしてください:", window.location.href);
    }
  };

  // SNS共有
  const handleShareX = () => {
    const text = `🎵 プレイリスト「${playlist?.title}」\nAMU RECORDSで聴く #AMURECORDS #プレイリスト`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-slate-500">プレイリストを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center max-w-md w-full shadow-lg">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">プレイリストが見つかりません</h2>
          <p className="text-xs text-slate-500 mb-6">
            非公開に設定されているか、すでに削除された可能性があります。
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
          >
            トップページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  // カバー画像（最初の4曲のカバー、または1曲目のカバー）
  const coverUrls = songs.map((s) => s.cover_url).filter(Boolean);

  return (
    <main className="min-h-screen bg-slate-50/50 text-slate-900 pb-32 font-sans selection:bg-indigo-500 selection:text-white">
      {/* 戻るナビゲーション */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          ホームへ戻る
        </Link>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* プレイリストヘッダーカード */}
        <div className="bg-slate-900 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 mb-8 sm:mb-12 relative shadow-2xl flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-10 overflow-hidden">
          {/* 背景のグラデーション発光 */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-32 -left-32 w-80 h-80 sm:w-96 sm:h-96 bg-indigo-500 rounded-full blur-[90px] opacity-25"></div>
            <div className="absolute -bottom-32 -right-32 w-80 h-80 sm:w-96 sm:h-96 bg-purple-500 rounded-full blur-[90px] opacity-25"></div>
          </div>

          {/* カバーアート（コラージュまたは単一） */}
          <div className="relative z-10 w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-2xl bg-slate-800 shadow-2xl overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
            {coverUrls.length >= 4 ? (
              <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                {coverUrls.slice(0, 4).map((url, i) => (
                  <img key={i} src={url} alt="cover" className="w-full h-full object-cover" />
                ))}
              </div>
            ) : coverUrls.length > 0 ? (
              <img src={coverUrls[0]} alt="cover" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center p-4">
                <svg className="w-16 h-16 sm:w-20 sm:h-20 text-slate-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span className="text-xs font-bold text-slate-500">PLAYLIST</span>
              </div>
            )}
          </div>

          {/* プレイリストメタ情報 */}
          <div className="relative z-10 text-center md:text-left flex-1 w-full min-w-0">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Playlist
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                playlist.is_public
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/20"
              }`}>
                {playlist.is_public ? "🌐 公開中" : "🔒 非公開"}
              </span>
              {isOwner && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                  あなたの作成
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-3 break-words">
              {playlist.title}
            </h1>

            {playlist.description && (
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-4 max-w-2xl whitespace-pre-wrap">
                {playlist.description}
              </p>
            )}

            {/* 作成者情報 */}
            <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap mb-6">
              {playlist.profiles && (
                <Link
                  href={`/artist/${playlist.profiles.id}`}
                  className="inline-flex items-center gap-2 group hover:opacity-90 transition-opacity"
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden bg-slate-700 border border-white/20">
                    {playlist.profiles.avatar_url ? (
                      <img src={playlist.profiles.avatar_url} alt={playlist.profiles.artist_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">
                        {playlist.profiles.artist_name?.[0] || "?"}
                      </div>
                    )}
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white group-hover:underline">
                    {playlist.profiles.artist_name}
                  </span>
                  <UserRoleBadge role={playlist.profiles.role} size="xs" theme="dark" />
                </Link>
              )}
              <span className="text-slate-500 text-xs">•</span>
              <span className="text-slate-400 text-xs font-medium">全 {songs.length} 曲</span>
            </div>

            {/* 再生＆操作ボタン */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
              <button
                type="button"
                onClick={() => handlePlayAll(false)}
                disabled={songs.length === 0}
                className="px-6 py-3 rounded-full font-black text-xs sm:text-sm tracking-wide bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white shadow-xl shadow-indigo-500/30 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                全曲を再生
              </button>

              <button
                type="button"
                onClick={() => handlePlayAll(true)}
                disabled={songs.length <= 1}
                className="px-5 py-3 rounded-full font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/15 text-white flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                シャッフル
              </button>

              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-4 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="リンクをコピー"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>{copied ? "コピー完了！" : "シェア"}</span>
              </button>

              <button
                type="button"
                onClick={handleShareX}
                className="px-3.5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Xでポスト"
              >
                <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </button>

              {/* 作成者の編集・削除ボタン */}
              {isOwner && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={handleDeletePlaylist}
                    className="px-3.5 py-3 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-semibold flex items-center transition-colors cursor-pointer"
                    title="プレイリストを削除"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 編集モーダル */}
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
              <h3 className="text-lg font-black text-slate-900 mb-4">プレイリストの編集</h3>
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">タイトル</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    maxLength={50}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">説明（任意）</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    maxLength={200}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={editIsPublic}
                      onChange={(e) => setEditIsPublic(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span className="font-bold">公開する（誰でも聴けるようにする）</span>
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !editTitle.trim()}
                    className="px-5 py-2 rounded-full bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? "保存中..." : "保存する"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 楽曲リストセクション */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs">
                🎵
              </span>
              収録曲（{songs.length}曲）
            </h2>
          </div>

          {songs.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 border-dashed p-6">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">まだ曲が追加されていません</p>
              <p className="text-xs text-slate-500 mb-5 max-w-sm mx-auto">
                各曲の「追加」ボタンから、このプレイリストにお気に入りの曲を追加してみましょう！
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                曲を探しに行く
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {songs.map((song, index) => {
                const artists = [
                  song.profiles ? { ...song.profiles, id: song.user_id } : null,
                  song.co_artist_1 ? { ...song.co_artist_1, id: song.co_artist_id_1 || song.co_artist_1.id } : null,
                  song.co_artist_2 ? { ...song.co_artist_2, id: song.co_artist_id_2 || song.co_artist_2.id } : null,
                ].filter(Boolean);

                const artistName = artists.length > 0
                  ? artists.map((a: any) => a.artist_name).join(" × ")
                  : (song.artist || "Unknown Artist");

                const isThisPlaying = currentSong?.id === song.id && isPlaying;

                return (
                  <div
                    key={song.id}
                    className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 transition-all duration-200 hover:shadow-md flex items-center gap-3 sm:gap-4 group relative overflow-hidden"
                  >
                    {/* 再生順番号 */}
                    <span className="w-5 text-center text-xs font-bold text-slate-400 shrink-0">
                      {index + 1}
                    </span>

                    {/* カバーアート ＆ 再生 */}
                    <button
                      type="button"
                      onClick={() => handlePlaySingle(song)}
                      className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 cursor-pointer active:scale-95 transition-transform"
                    >
                      {song.cover_url ? (
                        <img src={song.cover_url} alt="cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                          </svg>
                        </div>
                      )}
                      <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                        isThisPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}>
                        {isThisPlaying ? (
                          <div className="flex gap-0.5">
                            <div className="w-1 h-3 bg-white rounded-full animate-bounce"></div>
                            <div className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                            <div className="w-1 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                          </div>
                        ) : (
                          <svg className="w-5 h-5 text-white fill-current ml-0.5" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </div>
                    </button>

                    {/* 曲情報 */}
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-extrabold text-sm sm:text-base truncate ${
                        isThisPlaying ? "text-indigo-600" : "text-slate-900"
                      }`}>
                        <Link href={`/song/${song.id}`} className="hover:underline">
                          {song.title}
                        </Link>
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold truncate mt-0.5">
                        {artistName}
                      </p>
                    </div>

                    {/* 再生回数 */}
                    <div className="hidden sm:flex items-center gap-1 text-slate-400 text-xs shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      </svg>
                      <span>{song.play_count || 0}</span>
                    </div>

                    {/* 作成者の場合: リストから削除ボタン */}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSong(song.id)}
                        className="w-8 h-8 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title="プレイリストから外す"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
