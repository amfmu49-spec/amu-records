"use client";

import { useAudioPlayer } from "@/components/AudioPlayerProvider";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useState } from "react";
import CommentSection from "@/components/CommentSection";

export default function TrackList({ songs, currentUserId, showRank = false }: { songs: any[], currentUserId?: string, showRank?: boolean }) {
  const { playSong, currentSong, isPlaying } = useAudioPlayer();
  const supabase = createClient();
  const [activeCommentSongId, setActiveCommentSongId] = useState<string | null>(null);

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

  const toggleLike = async (songId: string) => {
    if (!currentUserId) {
      alert("いいねするにはログインが必要です");
      return;
    }

    const currentState = likesState[songId];
    const newIsLiked = !currentState.isLiked;
    
    // UIを即座に更新 (Optimistic Update)
    setLikesState(prev => ({
      ...prev,
      [songId]: {
        count: newIsLiked ? prev[songId].count + 1 : prev[songId].count - 1,
        isLiked: newIsLiked
      }
    }));

    // バックエンドへ送信
    if (newIsLiked) {
      await supabase.from("likes").insert([{ user_id: currentUserId, song_id: songId }]);
    } else {
      await supabase.from("likes").delete().match({ user_id: currentUserId, song_id: songId });
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
    <div className="grid gap-4">
      {songs.map((song, index) => {
        const profile = song.profiles;
        const artistName = profile?.artist_name || song.artist || "Unknown Artist";
        const isThisPlaying = currentSong?.id === song.id && isPlaying;
        const likeData = likesState[song.id] || { count: 0, isLiked: false };

        return (
          <div key={song.id} className="flex flex-col">
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 transition-all duration-300 hover:shadow-lg flex flex-row items-center gap-3 sm:gap-5 group relative z-10">
            
            {/* カバーアート＆再生ボタン（ネイティブボタン） */}
            <button 
              type="button"
              className="relative h-16 w-16 sm:h-20 sm:w-20 bg-slate-50 border border-slate-100 rounded-xl overflow-hidden shrink-0 cursor-pointer active:scale-95 transition-transform text-left p-0"
              onClick={() => playSong({ id: song.id, title: song.title, file_url: song.file_url, cover_url: song.cover_url, artist: artistName })}
            >
              {showRank && (
                <div className="absolute top-0 left-0 w-6 h-6 sm:w-7 sm:h-7 bg-indigo-600/90 backdrop-blur text-white font-black rounded-br-lg sm:rounded-br-xl flex items-center justify-center text-xs sm:text-sm z-20 shadow-md border-b border-r border-indigo-500/50">
                  {index + 1}
                </div>
              )}
              {song.cover_url ? (
                <img src={song.cover_url} alt="cover" className={`w-full h-full object-cover transition-transform duration-500 ${isThisPlaying ? "scale-110" : "group-hover:scale-110"}`} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-100">
                  <svg className="w-7 h-7 sm:w-8 sm:h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
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
                  <svg className="w-7 h-7 sm:w-10 sm:h-10 text-white fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
              </div>
            </button>
            
            {/* メタデータ */}
            <div className="flex-1 text-left w-full overflow-hidden py-1 min-w-0">
              <h3 className={`font-extrabold text-base sm:text-xl mb-0.5 sm:mb-1 truncate tracking-tight ${isThisPlaying ? "text-indigo-600" : "text-slate-900"}`}>
                {song.title}
              </h3>
              {profile ? (
                <Link href={`/artist/${song.user_id}`} className="inline-flex items-center gap-1.5 sm:gap-2 group/artist max-w-full">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                    {profile.avatar_url && <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />}
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-500 group-hover/artist:text-slate-900 transition-colors truncate">
                    {artistName}
                  </p>
                </Link>
              ) : (
                <p className="text-xs sm:text-sm font-semibold text-slate-500 truncate">{artistName}</p>
              )}
              
              {/* 再生数・いいね・コメント（インライン） */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-slate-500 mt-2">
                <div className="flex items-center gap-1 bg-slate-50 px-2 sm:px-2.5 py-1 rounded-full border border-slate-100 text-[11px] sm:text-xs">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <span className="font-bold">{song.play_count || 0}</span>
                </div>
                
                <button 
                  type="button"
                  onClick={() => toggleLike(song.id)}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full border transition-all active:scale-95 text-[11px] sm:text-xs cursor-pointer select-none ${likeData.isLiked ? 'bg-red-50 border-red-200 text-red-500 font-bold' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                >
                  <svg className={`w-3.5 h-3.5 ${likeData.isLiked ? 'fill-current' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                  </svg>
                  <span>{likeData.count}</span>
                </button>

                <button 
                  type="button"
                  onClick={() => setActiveCommentSongId(activeCommentSongId === song.id ? null : song.id)}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full border transition-all active:scale-95 text-[11px] sm:text-xs cursor-pointer select-none ${activeCommentSongId === song.id ? 'bg-indigo-50 border-indigo-200 text-indigo-600 font-bold' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                  <span>コメント</span>
                </button>
              </div>
            </div>

            {/* スマホ・PC共通の明示的再生ボタン */}
            <button 
              type="button"
              onClick={() => playSong({ id: song.id, title: song.title, file_url: song.file_url, cover_url: song.cover_url, artist: artistName })}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border items-center justify-center transition-all shrink-0 active:scale-90 flex cursor-pointer shadow-sm ${isThisPlaying ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900'}`}
            >
              {isThisPlaying ? (
                 <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                 <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            </div>
          
            {/* コメントセクション */}
            {activeCommentSongId === song.id && (
              <div className="mt-[-1rem] mx-4 border-x border-b border-slate-200 rounded-b-2xl overflow-hidden shadow-sm pt-4 relative z-0">
                <CommentSection songId={song.id} currentUserId={currentUserId} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
