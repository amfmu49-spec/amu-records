"use client";

import { useAudioPlayer } from "@/components/AudioPlayerProvider";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useState, useRef } from "react";
import { toCdnUrl } from "@/utils/cdn";
import CommentSection from "@/components/CommentSection";
import UserRoleBadge from "@/components/UserRoleBadge";
import AddToPlaylistModal from "@/components/AddToPlaylistModal";
import LyrimoModal from "@/components/LyrimoModal";

export default function TrackList({ 
  songs, 
  currentUserId, 
  showRank = false,
  limit 
}: { 
  songs: any[], 
  currentUserId?: string, 
  showRank?: boolean,
  limit?: number
}) {
  const { playSong, currentSong, isPlaying } = useAudioPlayer();
  const supabase = createClient();
  const [activeCommentSongId, setActiveCommentSongId] = useState<string | null>(null);
  const [playlistSong, setPlaylistSong] = useState<any | null>(null);
  const [lyrimoModalSong, setLyrimoModalSong] = useState<any | null>(null);
  const [showAll, setShowAll] = useState(false);

  // 表示する楽曲リスト（limit指定時は展開トグル対応）
  const displayedSongs = limit && !showAll ? songs.slice(0, limit) : songs;

  // いいね機能のローカル状態管理（画面のチラつきを防ぐため）
  const [likesState, setLikesState] = useState<{ [key: string]: { count: number, isLiked: boolean } }>(
    songs.reduce((acc, song) => {
      acc[song.id] = {
        count: song.likes?.length || 0,
        isLiked: song.likes?.some((l: any) => l.user_id === currentUserId) || false
      };
      return acc;
    }, {})
  );

  const { supporterRankInfo, refreshSupporterRank } = useAudioPlayer();
  const processingLikesRef = useRef<Set<string>>(new Set());

  // コメント件数のローカル状態管理（即時反映用）
  const [commentsState, setCommentsState] = useState<{ [key: string]: number }>(
    songs.reduce((acc, song) => {
      acc[song.id] = song.amu_comments?.length || 0;
      return acc;
    }, {})
  );

  const toggleLike = async (songId: string) => {
    if (!currentUserId) {
      alert("いいねするにはログインが必要です");
      return;
    }

    // 二重クリック・連打・多重通信を完全防止！
    if (processingLikesRef.current.has(songId)) return;
    processingLikesRef.current.add(songId);

    const currentState = likesState[songId] || { count: 0, isLiked: false };
    const newIsLiked = !currentState.isLiked;
    
    // UIを即座に更新 (Optimistic Update)
    setLikesState(prev => ({
      ...prev,
      [songId]: {
        count: newIsLiked ? (prev[songId]?.count || 0) + 1 : Math.max(0, (prev[songId]?.count || 1) - 1),
        isLiked: newIsLiked
      }
    }));

    try {
      // バックエンドへ送信
      if (newIsLiked) {
        await supabase.from("likes").insert([{ user_id: currentUserId, song_id: songId }]);
      } else {
        await supabase.from("likes").delete().match({ user_id: currentUserId, song_id: songId });
      }

      // サポーターランクをリアルタイム再計算
      await refreshSupporterRank();
    } catch (err) {
      console.error("TrackList toggleLike error:", err);
    } finally {
      processingLikesRef.current.delete(songId);
    }
  };

  if (!songs || songs.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
        <p className="text-slate-500 font-medium text-lg">まだ曲がアップロードされていません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid gap-3 sm:gap-4">
        {displayedSongs.map((song, index) => {
          const artists = [
            song.profiles ? { ...song.profiles, id: song.user_id } : null,
            song.co_artist_1 ? { ...song.co_artist_1, id: song.co_artist_id_1 || song.co_artist_1.id } : null,
            song.co_artist_2 ? { ...song.co_artist_2, id: song.co_artist_id_2 || song.co_artist_2.id } : null,
          ].filter(Boolean);

          const artistName = artists.length > 0 
            ? artists.map((a: any) => a.artist_name).join(" × ") 
            : (song.artist || "Unknown Artist");

          const isThisPlaying = currentSong?.id === song.id && isPlaying;
          const likeData = likesState[song.id] || { count: 0, isLiked: false };

          return (
            <div key={song.id} className="flex flex-col min-w-0">
              <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 md:p-5 transition-all duration-300 hover:shadow-lg flex flex-row items-center gap-2.5 sm:gap-4 group relative z-10 overflow-hidden">
              
              {/* カバーアート＆再生ボタン（ネイティブボタン） */}
              <button 
                type="button"
                className="relative h-14 w-14 sm:h-18 sm:w-18 md:h-20 md:w-20 bg-slate-50 border border-slate-100 rounded-xl overflow-hidden shrink-0 cursor-pointer active:scale-95 transition-transform text-left p-0 shadow-2xs"
                onClick={() => playSong({ id: song.id, title: song.title, file_url: song.file_url, cover_url: song.cover_url, artist: artistName }, songs)}
              >
                {showRank && (
                  <div
                    className={`absolute top-0 left-0 w-5 h-5 sm:w-6 sm:h-6 backdrop-blur font-black rounded-br-lg flex items-center justify-center text-[10px] sm:text-xs z-20 shadow-md border-b border-r ${
                      index === 0
                        ? "bg-gradient-to-br from-amber-300 via-amber-400 to-yellow-500 text-black border-amber-300/80 shadow-amber-500/30"
                        : index === 1
                        ? "bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-900 border-slate-300/80 shadow-slate-400/30"
                        : index === 2
                        ? "bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800 text-white border-amber-600/80 shadow-amber-700/30"
                        : "bg-indigo-600/90 text-white border-indigo-500/50"
                    }`}
                  >
                    {index === 0 ? "👑" : index + 1}
                  </div>
                )}
                {song.cover_url ? (
                  <img src={toCdnUrl(song.cover_url)} alt="cover" className={`w-full h-full object-cover transition-transform duration-500 ${isThisPlaying ? "scale-110" : "group-hover:scale-110"}`} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100">
                    <svg className="w-6 h-6 sm:w-8 sm:h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                  </div>
                )}

                {/* オーバーレイ再生インジケータ */}
                <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity pointer-events-none ${isThisPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                  {isThisPlaying ? (
                    <div className="flex gap-1">
                      <div className="w-1 sm:w-1.5 h-3 sm:h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1 sm:w-1.5 h-4 sm:h-6 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1 sm:w-1.5 h-3 sm:h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  ) : (
                    <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </div>
              </button>
              
              {/* メタデータ（w-fullを排除しflex-1 min-w-0で横はみ出しを完全防止） */}
              <div className="flex-1 min-w-0 text-left py-0.5 overflow-hidden">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5 min-w-0">
                  <h3 className={`font-extrabold text-sm sm:text-base md:text-xl truncate tracking-tight ${isThisPlaying ? "text-indigo-600" : "text-slate-900"}`}>
                    <Link href={`/song/${song.id}`} className="hover:underline hover:text-indigo-600 transition-colors">
                      {song.title}
                    </Link>
                  </h3>
                  {showRank && song.rankingScore !== undefined && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-purple-500/15 text-rose-600 border border-rose-300/70 shadow-2xs shrink-0 cursor-help"
                      title={`総合 ${song.rankingScore}pt（再生:${song.rankingBreakdown?.play || 0}P / いいね:${song.rankingBreakdown?.like || 0}P / コメント:${song.rankingBreakdown?.comment || 0}P）`}
                    >
                      <span>🔥</span>
                      <span>{song.rankingScore} pt</span>
                    </span>
                  )}
                  {song.synced_lyrics && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black bg-gradient-to-r from-indigo-600 to-pink-600 text-white shrink-0 shadow-2xs tracking-wider">
                      <span>🎬</span>
                      <span>Lyrimo対応</span>
                    </span>
                  )}
                </div>
                {artists.length > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap max-w-full">
                    {/* 重なりアバターアイコン */}
                    <div className="flex -space-x-1.5 overflow-hidden shrink-0">
                      {artists.map((a: any, i: number) => (
                        <Link 
                          key={a.id || i} 
                          href={`/artist/${a.id}`} 
                          title={a.artist_name}
                          className="relative z-10 hover:z-20 transition-transform hover:scale-110 block"
                        >
                          <div className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full overflow-hidden bg-slate-100 border border-white shadow-xs">
                            {a.avatar_url ? (
                              <img src={a.avatar_url} alt={a.artist_name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-slate-200 flex items-center justify-center text-[7px] font-bold text-slate-600">
                                {a.artist_name?.[0] || "?"}
                              </div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>

                    {/* アーティスト名連名リンク (A × B × C) */}
                    <div className="flex items-center flex-wrap gap-1 text-xs sm:text-sm font-semibold text-slate-500 min-w-0">
                      {artists.map((a: any, i: number) => (
                        <span key={a.id || i} className="inline-flex items-center max-w-full">
                          <Link 
                            href={`/artist/${a.id}`} 
                            className="hover:text-slate-900 hover:underline transition-colors truncate max-w-[120px] sm:max-w-[200px]"
                          >
                            {a.artist_name}
                          </Link>
                          {i < artists.length - 1 && (
                            <span className="mx-1 text-indigo-500 font-bold select-none text-[11px] sm:text-xs">×</span>
                          )}
                        </span>
                      ))}
                      <UserRoleBadge role="creator" size="xs" />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm font-semibold text-slate-500 truncate">{artistName}</p>
                )}
                
                {/* 再生数・いいね・コメント・個別ページ */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 text-slate-500 mt-1.5 sm:mt-2">
                  <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 sm:py-1 rounded-full border border-slate-100 text-[10px] sm:text-xs shrink-0">
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span className="font-bold">{song.play_count || 0}</span>
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => toggleLike(song.id)}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border transition-all active:scale-95 text-[10px] sm:text-xs cursor-pointer select-none shrink-0 ${
                      likeData.isLiked
                        ? supporterRankInfo.rank === "platinum"
                          ? "bg-cyan-50 border-cyan-300 text-cyan-700 font-black shadow-2xs"
                          : supporterRankInfo.rank === "gold"
                          ? "bg-amber-50 border-amber-300 text-amber-700 font-bold shadow-2xs"
                          : supporterRankInfo.rank === "silver"
                          ? "bg-slate-100 border-slate-300 text-slate-700 font-bold"
                          : supporterRankInfo.rank === "bronze"
                          ? "bg-amber-950/10 border-[#CD7F32]/50 text-[#8a4a16] font-bold"
                          : "bg-red-50 border-red-200 text-red-500 font-bold"
                        : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    <svg
                      className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${
                        likeData.isLiked ? supporterRankInfo.heartColor : "fill-none stroke-current"
                      }`}
                      style={
                        likeData.isLiked && supporterRankInfo.heartHex
                          ? { color: supporterRankInfo.heartHex, fill: supporterRankInfo.heartHex }
                          : undefined
                      }
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                    </svg>
                    <span>{likeData.count}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setActiveCommentSongId(activeCommentSongId === song.id ? null : song.id)}
                    className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border transition-all active:scale-95 text-[10px] sm:text-xs cursor-pointer select-none shrink-0 ${activeCommentSongId === song.id ? 'bg-indigo-50 border-indigo-200 text-indigo-600 font-bold' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                  >
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    <span>コメント</span>
                    <span className={`px-1.5 py-0.2 rounded-full font-bold text-[10px] ${
                      activeCommentSongId === song.id 
                        ? 'bg-indigo-200 text-indigo-800' 
                        : (commentsState[song.id] ?? (song.amu_comments?.length || 0)) > 0
                          ? 'bg-indigo-100 text-indigo-700 font-black'
                          : 'bg-slate-200/70 text-slate-500'
                    }`}>
                      {commentsState[song.id] ?? (song.amu_comments?.length || 0)}
                    </span>
                  </button>

                  <Link
                    href={`/song/${song.id}`}
                    className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border transition-all active:scale-95 text-[10px] sm:text-xs cursor-pointer select-none bg-slate-50 border-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0"
                    title="楽曲詳細ページを見る"
                  >
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>詳細</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => setPlaylistSong(song)}
                    className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border transition-all active:scale-95 text-[10px] sm:text-xs cursor-pointer select-none bg-slate-50 border-slate-100 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 shrink-0"
                    title="プレイリストに追加"
                  >
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>追加</span>
                  </button>

                  {/* YouTube リンクボタン (アイコンのみ) */}
                  {song.youtube_url && (
                    <a
                      href={song.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 sm:p-1.5 rounded-full border transition-all active:scale-95 cursor-pointer select-none bg-red-50 border-red-200 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 shrink-0 shadow-2xs"
                      title="YouTubeで観る"
                      aria-label="YouTubeで観る"
                    >
                      <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                    </a>
                  )}

                  {/* TikTok リンクボタン (アイコンのみ) */}
                  {song.tiktok_url && (
                    <a
                      href={song.tiktok_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 sm:p-1.5 rounded-full border transition-all active:scale-95 cursor-pointer select-none bg-slate-900 border-slate-900 text-white hover:bg-black hover:border-black shrink-0 shadow-2xs"
                      title="TikTokで観る"
                      aria-label="TikTokで観る"
                    >
                      <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current text-white" viewBox="0 0 24 24">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 2.89 3.5 2.76 1.4-.04 2.7-1.04 3.04-2.4.15-.53.18-1.09.18-1.64V.02h-.04z"/>
                      </svg>
                    </a>
                  )}
                </div>
              </div>

              {/* 右側の再生マーク、およびその下に配置するリリモMOVIE絵文字ボタン */}
              <div className="flex flex-col items-center justify-center shrink-0 ml-auto gap-1">
                <button 
                  type="button"
                  onClick={() => playSong({ id: song.id, title: song.title, file_url: song.file_url, cover_url: song.cover_url, artist: artistName }, songs)}
                  className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border items-center justify-center transition-all shrink-0 active:scale-90 flex cursor-pointer shadow-xs ${isThisPlaying ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900'}`}
                  title={isThisPlaying ? "一時停止" : "再生"}
                >
                  {isThisPlaying ? (
                     <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  ) : (
                     <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>

                {/* ★ 右のほうにある再生マークの「下」：リリモ対応曲のMOVIE絵文字ボタン */}
                {song.synced_lyrics && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLyrimoModalSong({
                        ...song,
                        artist: artistName,
                      });
                    }}
                    title="🎬 タップしてリリモ小窓を開く（文字PV・リリック）"
                    className="inline-flex items-center justify-center gap-0.5 px-1.5 sm:px-2 py-0.5 rounded-full bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-600 border border-indigo-200/90 text-[10px] sm:text-xs font-black shadow-2xs hover:scale-105 transition-all cursor-pointer group/movie select-none"
                  >
                    <span className="text-xs group-hover/movie:rotate-12 transition-transform">🎬</span>
                    <span className="font-extrabold tracking-tight text-[8px] sm:text-[9px]">MOVIE</span>
                  </button>
                )}
              </div>
              </div>
            
              {/* コメントセクション */}
              {activeCommentSongId === song.id && (
                <div className="mt-[-1rem] mx-4 border-x border-b border-slate-200 rounded-b-2xl overflow-hidden shadow-sm pt-4 relative z-0">
                  <CommentSection 
                    songId={song.id} 
                    currentUserId={currentUserId}
                    onCountChange={(count) => setCommentsState(prev => ({ ...prev, [song.id]: count }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* limit設定時に全曲トグル表示するボタン */}
      {limit && songs.length > limit && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-slate-50 active:scale-95 border border-slate-200 text-xs sm:text-sm font-bold text-slate-700 shadow-xs hover:shadow transition-all cursor-pointer"
          >
            {showAll ? (
              <>
                <span>5曲表示に戻す</span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7"/></svg>
              </>
            ) : (
              <>
                <span>もっと見る（全{songs.length}曲）</span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
              </>
            )}
          </button>
        </div>
      )}
      {/* プレイリスト追加モーダル */}
      <AddToPlaylistModal
        song={playlistSong}
        isOpen={!!playlistSong}
        onClose={() => setPlaylistSong(null)}
        currentUserId={currentUserId}
      />

      {/* リリモ小窓モーダル（文字PV ＆ 歌詞リリック） */}
      <LyrimoModal
        song={lyrimoModalSong}
        onClose={() => setLyrimoModalSong(null)}
      />
    </div>
  );
}

