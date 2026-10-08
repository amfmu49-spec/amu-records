"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";

type Song = {
  id: string;
  title: string;
  file_url: string;
  cover_url: string | null;
  artist?: string;
};

type AudioPlayerContextType = {
  currentSong: Song | null;
  isPlaying: boolean;
  playSong: (song: Song) => void;
  togglePlay: () => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextType>({
  currentSong: null,
  isPlaying: false,
  playSong: () => {},
  togglePlay: () => {},
});

export const useAudioPlayer = () => useContext(AudioPlayerContext);

export default function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const onTimeUpdate = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  // バックグラウンド再生（MediaSession API）の対応
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist || 'Unknown Artist',
        album: 'AMU RECORDS',
        artwork: [
          { src: currentSong.cover_url || 'https://via.placeholder.com/512', sizes: '512x512', type: 'image/jpeg' },
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
    }
  }, [currentSong]);

  const playSong = (song: Song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
      return;
    }
    
    setCurrentSong(song);
    if (audioRef.current) {
      audioRef.current.src = song.file_url;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => console.error("Playback failed:", e));
      }
      
      // 再生回数を増やす (非同期で実行)
      import("@/utils/supabase/client").then(async ({ createClient }) => {
        try {
          const supabase = createClient();
          await supabase.rpc("increment_play_count", { song_id_param: song.id });
        } catch (err) {
          console.error("Failed to increment play count", err);
        }
      });
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentSong) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error("Playback failed:", e));
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = percent * audioRef.current.duration;
  };

  return (
    <AudioPlayerContext.Provider value={{ currentSong, isPlaying, playSong, togglePlay }}>
      {children}
      <audio ref={audioRef} playsInline preload="metadata" />

      {/* グローバルプレイヤー（画面下部固定） */}
      {currentSong && (
        <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-[100] transition-all duration-300">
          {/* プログレスバー */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-200 cursor-pointer group" onClick={seek}>
            <div 
              className="h-full bg-indigo-500 group-hover:bg-indigo-400 transition-colors relative" 
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-indigo-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            {/* 曲情報 */}
            <div className="flex items-center gap-4 flex-1 overflow-hidden">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0 shadow-sm border border-slate-200">
                {currentSong.cover_url ? (
                  <img src={currentSong.cover_url} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-full h-full p-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                )}
              </div>
              <div className="truncate">
                <h4 className="font-bold text-slate-900 truncate text-sm sm:text-base">{currentSong.title}</h4>
                <p className="text-xs font-medium text-slate-500 truncate">{currentSong.artist}</p>
              </div>
            </div>

            {/* コントロール */}
            <div className="flex items-center gap-4">
              <button 
                type="button"
                onClick={togglePlay} 
                className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 active:scale-95 transition-all shadow-md"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg className="w-5 h-5 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>
            </div>
            
            <div className="flex-1 hidden sm:block"></div>
          </div>
        </div>
      )}
    </AudioPlayerContext.Provider>
  );
}
