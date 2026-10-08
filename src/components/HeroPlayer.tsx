"use client";

import { useAudioPlayer } from "./AudioPlayerProvider";
import Link from "next/link";

export default function HeroPlayer({ song }: { song: any }) {
  const { playSong, currentSong, isPlaying } = useAudioPlayer();

  if (!song) return null;

  const isThisPlaying = currentSong?.id === song.id && isPlaying;
  const artistName = song.profiles?.artist_name || song.artist || "Unknown Artist";

  const handlePlay = () => {
    playSong({
      id: song.id,
      title: song.title,
      file_url: song.file_url,
      cover_url: song.cover_url,
      artist: artistName
    });
  };

  return (
    <div className="bg-slate-900 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-12 mb-12 sm:mb-16 relative shadow-2xl flex flex-col md:flex-row items-center gap-6 sm:gap-10">
      {/* 背景のぼかしエフェクト（親コンテナ内に完全隔離） */}
      <div className="absolute inset-0 overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] pointer-events-none">
        <div className="absolute -top-32 -left-32 w-80 h-80 sm:w-96 sm:h-96 bg-indigo-500 rounded-full blur-[90px] opacity-25"></div>
        <div className="absolute -bottom-32 -right-32 w-80 h-80 sm:w-96 sm:h-96 bg-purple-500 rounded-full blur-[90px] opacity-25"></div>
      </div>
      
      {/* カバーアート（ネイティブボタンとして実装） */}
      <button 
        type="button"
        className="w-44 h-44 sm:w-64 sm:h-64 rounded-2xl bg-slate-800 shadow-2xl overflow-hidden shrink-0 relative group cursor-pointer z-10 active:scale-95 transition-transform"
        onClick={handlePlay}
      >
        {song.cover_url ? (
          <img src={song.cover_url} alt="Cover" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800">
             <svg className="w-16 h-16 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
          </div>
        )}
        
        {/* ホバー/アクティブ時の再生オーバーレイ */}
        <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-300 pointer-events-none ${isThisPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-xl">
            {isThisPlaying ? (
              <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg className="w-7 h-7 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </div>
        </div>
      </button>

      {/* 曲情報 */}
      <div className="relative z-10 text-center md:text-left flex-1 w-full min-w-0">
        <p className="text-indigo-400 font-bold tracking-widest text-xs sm:text-sm mb-2 uppercase">Featured Track</p>
        <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-3 line-clamp-2 break-words">
          <Link href={`/song/${song.id}`} className="hover:underline hover:text-indigo-200 transition-colors">
            {song.title}
          </Link>
        </h2>
        
        <Link href={`/artist/${song.user_id}`} className="inline-flex items-center gap-2.5 hover:opacity-80 active:opacity-60 transition-opacity mb-6">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden bg-slate-700">
            {song.profiles?.avatar_url && <img src={song.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" />}
          </div>
          <p className="text-base sm:text-xl text-slate-300 font-medium truncate">{artistName}</p>
        </Link>
        
        {song.description && (
          <p className="text-slate-400 line-clamp-2 leading-relaxed max-w-xl hidden sm:block mb-8">
            {song.description}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 sm:gap-4 max-w-full">
          <button 
            type="button"
            onClick={handlePlay}
            className="relative z-20 bg-white hover:bg-slate-100 active:scale-95 text-slate-900 px-5 sm:px-8 py-3 sm:py-4 rounded-full font-bold shadow-[0_0_30px_rgba(255,255,255,0.25)] transition-all flex items-center gap-2 sm:gap-3 select-none cursor-pointer text-xs sm:text-base shrink-0"
          >
            {isThisPlaying ? (
              <>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                PAUSE
              </>
            ) : (
              <>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                PLAY NOW
              </>
            )}
          </button>

          <Link
            href={`/song/${song.id}`}
            className="relative z-20 bg-white/10 hover:bg-white/20 active:scale-95 text-white border border-white/20 px-4 sm:px-6 py-3 sm:py-4 rounded-full font-semibold transition-all flex items-center gap-2 select-none text-xs sm:text-sm backdrop-blur-md cursor-pointer shrink-0"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            楽曲ページを見る
          </Link>
        </div>
      </div>
    </div>
  );
}
