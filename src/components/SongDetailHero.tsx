"use client";

import { useState, useEffect, useRef } from "react";
import { useAudioPlayer } from "@/components/AudioPlayerProvider";
import { createClient } from "@/utils/supabase/client";
import { preloadAudioToCache } from "@/utils/audioCache";
import { toCdnUrl } from "@/utils/cdn";
import Link from "next/link";
import UserRoleBadge from "@/components/UserRoleBadge";
import AddToPlaylistModal from "@/components/AddToPlaylistModal";

interface SongDetailHeroProps {
  song: any;
  initialIsLiked: boolean;
  likeCount: number;
  currentUserId?: string;
  commentCount?: number;
}

export default function SongDetailHero({
  song,
  initialIsLiked,
  likeCount: initialLikeCount,
  currentUserId,
  commentCount = 0,
}: SongDetailHeroProps) {
  const { playSong, currentSong, isPlaying, isLiveMode, toggleLiveMode } = useAudioPlayer();
  const supabase = createClient();

  useEffect(() => {
    if (song?.file_url) {
      preloadAudioToCache(song.file_url);
    }
  }, [song?.file_url]);

  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [copied, setCopied] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  const isThisPlaying = currentSong?.id === song.id && isPlaying;

  const artists = [
    song.profiles ? { ...song.profiles, id: song.user_id } : null,
    song.co_artist_1 ? { ...song.co_artist_1, id: song.co_artist_id_1 || song.co_artist_1.id } : null,
    song.co_artist_2 ? { ...song.co_artist_2, id: song.co_artist_id_2 || song.co_artist_2.id } : null,
  ].filter(Boolean);

  const artistName = artists.length > 0 
    ? artists.map((a: any) => a.artist_name).join(" × ") 
    : (song.artist || "Unknown Artist");

  const handlePlayToggle = () => {
    playSong({
      id: song.id,
      title: song.title,
      file_url: song.file_url,
      cover_url: song.cover_url,
      artist: artistName,
    });
  };

  const { supporterRankInfo, refreshSupporterRank } = useAudioPlayer();
  const isProcessingLikeRef = useRef(false);

  const handleToggleLike = async () => {
    if (!currentUserId) {
      alert("いいねするにはGoogleでログインしてください");
      return;
    }

    if (isProcessingLikeRef.current) return; // 二重クリック防止
    isProcessingLikeRef.current = true;

    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    setLikeCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      if (nextLiked) {
        await supabase.from("likes").insert([{ user_id: currentUserId, song_id: song.id }]);
      } else {
        await supabase.from("likes").delete().match({ user_id: currentUserId, song_id: song.id });
      }
      await refreshSupporterRank();
    } catch (err) {
      console.error("SongDetailHero like error:", err);
    } finally {
      isProcessingLikeRef.current = false;
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // フォールバック
      prompt("以下のURLをコピーしてください:", window.location.href);
    }
  };

  const handleShareX = () => {
    const text = `🎧 「${song.title}」- ${artistName}\nAMU RECORDSで聴く #AMURECORDS #自作音楽`;
    const url = window.location.href;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const handleShareLine = () => {
    const url = window.location.href;
    const shareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const formattedDate = song.created_at
    ? new Date(song.created_at).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <div className="bg-slate-900 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-12 mb-10 relative shadow-2xl overflow-hidden">
      {/* 背景のグローエフェクト */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-80 h-80 sm:w-96 sm:h-96 bg-indigo-500 rounded-full blur-[100px] opacity-25"></div>
        <div className="absolute -bottom-32 -right-32 w-80 h-80 sm:w-96 sm:h-96 bg-purple-500 rounded-full blur-[100px] opacity-25"></div>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8 sm:gap-12">
        {/* レコード風カバーアート */}
        <div className="relative shrink-0 group">
          <div className="w-56 h-56 sm:w-72 sm:h-72 rounded-2xl sm:rounded-3xl bg-slate-800 shadow-2xl overflow-hidden border-2 border-white/10 relative">
            {song.cover_url ? (
              <img
                src={toCdnUrl(song.cover_url)}
                alt={song.title}
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isThisPlaying ? "scale-105" : "group-hover:scale-105"
                }`}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-500 gap-3">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <span className="text-xs font-bold uppercase tracking-wider">No Artwork</span>
              </div>
            )}

            {/* 再生中オーバーレイ */}
            {isThisPlaying && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                <div className="flex items-end gap-1.5 h-8">
                  <div className="w-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ height: "100%", animationDelay: "0ms" }}></div>
                  <div className="w-1.5 bg-purple-400 rounded-full animate-bounce" style={{ height: "60%", animationDelay: "150ms" }}></div>
                  <div className="w-1.5 bg-pink-400 rounded-full animate-bounce" style={{ height: "85%", animationDelay: "300ms" }}></div>
                  <div className="w-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ height: "40%", animationDelay: "450ms" }}></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 楽曲メタデータとアクション */}
        <div className="flex-1 w-full text-center md:text-left min-w-0">
          <div className="flex items-center gap-2 justify-center md:justify-start flex-wrap mb-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold tracking-wider uppercase border border-indigo-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
              Song Single
            </div>
            {song.synced_lyrics && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-pink-500 text-white text-xs font-black shadow-md tracking-wider">
                <span>🎬</span>
                <span>Lyrimo対応</span>
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4 break-words">
            {song.title}
          </h1>

          {/* アーティストチップ（複数連名対応） */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-6">
            {artists.length > 0 ? (
              artists.map((a: any, i: number) => (
                <div key={a.id || i} className="inline-flex items-center gap-2">
                  <Link
                    href={`/artist/${a.id}`}
                    className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 active:scale-95 px-3 py-1.5 rounded-full backdrop-blur-md transition-all group"
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-700 shrink-0 border border-white/20">
                      {a.avatar_url ? (
                        <img src={a.avatar_url} alt={a.artist_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white font-bold">
                          {a.artist_name?.slice(0, 1) || "?"}
                        </div>
                      )}
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white transition-colors truncate max-w-[140px] sm:max-w-[200px]">
                      {a.artist_name}
                    </span>
                    <UserRoleBadge role={a.role} size="xs" theme="dark" />
                    <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                  {i < artists.length - 1 && (
                    <span className="text-indigo-400 font-bold select-none text-sm px-0.5">×</span>
                  )}
                </div>
              ))
            ) : (
              <span className="text-sm font-semibold text-slate-300">{artistName}</span>
            )}
          </div>

          {/* メタ統計情報 */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-xs sm:text-sm text-slate-300 mb-8">
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>再生 <b className="text-white font-bold">{song.play_count || 0}</b> 回</span>
            </div>

            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <svg className="w-4 h-4 text-pink-400 fill-current" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>いいね <b className="text-white font-bold">{likeCount}</b></span>
            </div>

            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>コメント <b className="text-white font-bold">{commentCount}</b> 件</span>
            </div>

            {formattedDate && (
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{formattedDate} 配信</span>
              </div>
            )}
          </div>

          {/* メインアクションボタン */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 sm:gap-4 mb-8">
            {/* 再生/一時停止 */}
            <button
              type="button"
              onClick={handlePlayToggle}
              className={`px-8 py-4 rounded-full font-black text-sm sm:text-base tracking-wide flex items-center gap-3 transition-all active:scale-95 shadow-xl select-none cursor-pointer ${
                isThisPlaying
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/30"
                  : "bg-white hover:bg-slate-100 text-slate-900 shadow-white/20"
              }`}
            >
              {isThisPlaying ? (
                <>
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                  一時停止
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  楽曲を再生
                </>
              )}
            </button>

            {/* LIVEモード専用ステージへ遷移するボタン */}
            <Link
              href="/live"
              onClick={() => {
                if (!isLiveMode) toggleLiveMode();
                if (!isThisPlaying) handlePlayToggle();
              }}
              title="この曲で客席視点のライブステージ画面へ！"
              className={`px-4 sm:px-5 py-4 rounded-full font-black text-sm flex items-center gap-2 border transition-all active:scale-95 select-none cursor-pointer ${
                isLiveMode
                  ? "bg-gradient-to-r from-red-600 via-rose-600 to-purple-600 text-white border-transparent shadow-lg shadow-rose-500/30 ring-2 ring-rose-400/50"
                  : "bg-white/10 hover:bg-white/20 border-white/15 text-white"
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${isLiveMode ? "bg-white animate-pulse" : "bg-slate-400"}`} />
              <span>LIVEステージ</span>
              <span>🏟️</span>
            </Link>

            {/* いいねボタン（サポーターランク色に対応） */}
            <button
              type="button"
              onClick={handleToggleLike}
              className={`px-5 py-4 rounded-full font-bold text-sm flex items-center gap-2 border transition-all active:scale-95 select-none cursor-pointer ${
                isLiked
                  ? supporterRankInfo.rank === "platinum"
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/20"
                    : supporterRankInfo.rank === "gold"
                    ? "bg-amber-500/20 border-amber-400 text-amber-200 shadow-md shadow-amber-500/20"
                    : supporterRankInfo.rank === "silver"
                    ? "bg-slate-400/20 border-slate-300 text-slate-200"
                    : supporterRankInfo.rank === "bronze"
                    ? "bg-[#CD7F32]/25 border-[#CD7F32]/60 text-amber-200"
                    : "bg-red-500/20 border-red-500/40 text-red-400"
                  : "bg-white/10 hover:bg-white/20 border-white/15 text-white"
              }`}
            >
              <svg
                className={`w-5 h-5 ${isLiked ? supporterRankInfo.heartColor : "fill-none stroke-current"}`}
                style={
                  isLiked && supporterRankInfo.heartHex
                    ? { color: supporterRankInfo.heartHex, fill: supporterRankInfo.heartHex }
                    : undefined
                }
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span>{isLiked ? "いいね済み" : "いいね"}</span>
            </button>

            {/* リンクコピー */}
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-4 py-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white font-medium text-sm flex items-center gap-2 transition-all active:scale-95 select-none cursor-pointer"
              title="ページリンクをコピー"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{copied ? "コピー完了！" : "シェア"}</span>
            </button>

            {/* プレイリスト追加 */}
            <button
              type="button"
              onClick={() => setShowPlaylistModal(true)}
              className="px-4 py-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white font-medium text-sm flex items-center gap-2 transition-all active:scale-95 select-none cursor-pointer"
              title="プレイリストに追加"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>リスト追加</span>
            </button>
          </div>

          {/* YouTube / TikTok 公式動画リンクボタン */}
          {(song.youtube_url || song.tiktok_url) && (
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-6">
              {song.youtube_url && (
                <a
                  href={song.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-lg shadow-red-600/30 transition-all active:scale-95 hover:-translate-y-0.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <span>YouTubeで観る</span>
                  <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}

              {song.tiktok_url && (
                <a
                  href={song.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3 rounded-full bg-black hover:bg-slate-900 text-white border border-white/20 font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-lg shadow-black/40 transition-all active:scale-95 hover:-translate-y-0.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 fill-current text-white" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 2.89 3.5 2.76 1.4-.04 2.7-1.04 3.04-2.4.15-.53.18-1.09.18-1.64V.02h-.04z"/>
                  </svg>
                  <span>TikTokで観る</span>
                  <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          )}

          {/* SNSシェアボタン群 */}
          <div className="flex items-center justify-center md:justify-start gap-2 pt-2 border-t border-white/10">
            <span className="text-xs text-slate-400 font-medium mr-2">SNSで共有:</span>
            
            <button
              type="button"
              onClick={handleShareX}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Xでポスト
            </button>

            <button
              type="button"
              onClick={handleShareLine}
              className="px-3 py-1.5 rounded-full bg-[#06C755]/20 hover:bg-[#06C755]/30 text-[#06C755] border border-[#06C755]/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>LINE</span>
            </button>
          </div>
        </div>
      </div>

      {/* 楽曲キャプション/説明（ある場合） */}
      {song.description && (
        <div className="mt-8 pt-8 border-t border-white/10 relative z-10">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            楽曲エピソード・紹介
          </h3>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed whitespace-pre-wrap bg-white/5 p-5 rounded-2xl border border-white/5">
            {song.description}
          </p>
        </div>
      )}
      {/* プレイリスト追加モーダル */}
      <AddToPlaylistModal
        song={song}
        isOpen={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
        currentUserId={currentUserId}
      />
    </div>
  );
}
