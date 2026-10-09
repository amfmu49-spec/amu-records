"use client";

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

export type Song = {
  id: string;
  title: string;
  file_url: string;
  cover_url: string | null;
  artist?: string;
};

type AudioPlayerContextType = {
  currentSong: Song | null;
  isPlaying: boolean;
  isRandom: boolean;
  isCrossfading: boolean;
  playSong: (song: Song, playlist?: any[]) => void;
  togglePlay: () => void;
  toggleRandom: () => void;
  playNextSong: () => void;
  playPrevSong: () => void;
  startRandomPlay: (songs: any[]) => void;
  setPlaylist: (songs: any[]) => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextType>({
  currentSong: null,
  isPlaying: false,
  isRandom: false,
  isCrossfading: false,
  playSong: () => {},
  togglePlay: () => {},
  toggleRandom: () => {},
  playNextSong: () => {},
  playPrevSong: () => {},
  startRandomPlay: () => {},
  setPlaylist: () => {},
});

export const useAudioPlayer = () => useContext(AudioPlayerContext);

// 任意の曲オブジェクトを正規化
const normalizeSong = (item: any): Song => {
  if (!item) return { id: "", title: "", file_url: "", cover_url: null, artist: "" };
  if (item.artist && item.file_url && typeof item.artist === "string") {
    return {
      id: item.id,
      title: item.title,
      file_url: item.file_url,
      cover_url: item.cover_url,
      artist: item.artist,
    };
  }

  const artists = [
    item.profiles?.artist_name,
    item.co_artist_1?.artist_name,
    item.co_artist_2?.artist_name,
  ].filter(Boolean);

  const artistName = artists.length > 0 ? artists.join(" × ") : (item.artist || "Unknown Creator");

  return {
    id: item.id,
    title: item.title,
    file_url: item.file_url,
    cover_url: item.cover_url || null,
    artist: artistName,
  };
};

export default function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRandom, setIsRandom] = useState(false);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playlist, setPlaylistState] = useState<Song[]>([]);

  // 再生履歴（最近再生したIDを保持して連続重複を防ぐ）
  const historyRef = useRef<string[]>([]);

  // Dual Deckオーディオ要素（AとB）
  const audioRefA = useRef<HTMLAudioElement | null>(null);
  const audioRefB = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<"A" | "B">("A");

  // クロスフェードのインターバル・状態参照
  const fadeIntervalRef = useRef<any>(null);
  const isFadingRef = useRef<boolean>(false);
  const isRandomRef = useRef<boolean>(false);
  const playlistRef = useRef<Song[]>([]);

  // Refを最新stateと同期
  useEffect(() => {
    isRandomRef.current = isRandom;
  }, [isRandom]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  // 再生回数のインクリメント
  const incrementPlayCount = (songId: string) => {
    try {
      const supabase = createClient();
      supabase.rpc("increment_play_count", { song_id_param: songId }).then();
    } catch (e) {
      console.warn("Failed to increment play count:", e);
    }
  };

  // プレイリスト更新
  const setPlaylist = useCallback((songs: any[]) => {
    if (!songs || songs.length === 0) return;
    const normalized = songs.map(normalizeSong).filter((s) => s.file_url);
    setPlaylistState(normalized);
  }, []);

  // 次に再生するランダムな曲を選択
  const pickNextRandomSong = useCallback((): Song | null => {
    const list = playlistRef.current;
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];

    // 直近に再生された曲（現在の曲＋履歴）を除外した候補
    const currentId = currentSong?.id;
    const recentIds = new Set([currentId, ...historyRef.current.slice(-Math.min(5, list.length - 1))]);
    const candidates = list.filter((s) => !recentIds.has(s.id));

    // 候補が尽きた場合は現在の曲以外から
    const pool = candidates.length > 0 ? candidates : list.filter((s) => s.id !== currentId);
    if (pool.length === 0) return list[0];

    const picked = pool[Math.floor(Math.random() * pool.length)];
    return picked;
  }, [currentSong]);

  // クロスフェードを実行して次の曲へ進む
  // durationMs: 自動移行時は 1500ms（1.5秒）、手動スキップ時は 400ms（0.4秒）
  const executeCrossfade = useCallback((nextSong: Song, durationMs = 1500) => {
    if (isFadingRef.current) return;

    const currentDeck = activeDeckRef.current;
    const nextDeck = currentDeck === "A" ? "B" : "A";
    const currentAudio = currentDeck === "A" ? audioRefA.current : audioRefB.current;
    const nextAudio = nextDeck === "A" ? audioRefA.current : audioRefB.current;

    if (!currentAudio || !nextAudio) return;

    // 既存のフェード処理をクリア
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }

    isFadingRef.current = true;
    setIsCrossfading(true);

    // 次の曲をUIに即座に反映（ユーザーが今どの曲に移ったか分かりやすくする）
    setCurrentSong(nextSong);
    setProgress(0);

    // 次の曲をセットして再生開始（音量0から）
    nextAudio.src = nextSong.file_url;
    nextAudio.volume = 0;
    nextAudio.currentTime = 0;

    const playPromise = nextAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("Crossfade target audio play error:", err);
      });
    }

    incrementPlayCount(nextSong.id);

    // 40ms間隔で滑らかに音量カーブを適用
    const STEPS = Math.max(15, Math.floor(durationMs / 40));
    const stepInterval = durationMs / STEPS;
    let step = 0;

    fadeIntervalRef.current = setInterval(() => {
      step++;
      const ratio = Math.min(1, step / STEPS); // 0 -> 1

      // Equal Power Crossfade Curve (イコールパワーカーブ)
      // 音のエネルギー和 (cos^2 + sin^2 = 1) を一定に保ち、音量の落ち込み（引っ込み）を完全に防ぐ
      const outVolume = Math.cos(ratio * 0.5 * Math.PI); // 1.0 -> 0.0
      const inVolume = Math.sin(ratio * 0.5 * Math.PI);  // 0.0 -> 1.0

      if (currentAudio) {
        currentAudio.volume = Math.max(0, Math.min(1, outVolume));
      }
      if (nextAudio) {
        nextAudio.volume = Math.max(0, Math.min(1, inVolume));
      }

      if (step >= STEPS) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;

        // フェード完了処理
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.volume = 1;
          currentAudio.currentTime = 0;
        }
        if (nextAudio) {
          nextAudio.volume = 1;
        }

        activeDeckRef.current = nextDeck;
        isFadingRef.current = false;
        setIsCrossfading(false);

        // 履歴に追加
        historyRef.current.push(nextSong.id);
        if (historyRef.current.length > 20) {
          historyRef.current.shift();
        }
      }
    }, stepInterval);
  }, []);

  // クロスフェードなしの直接曲切り替え
  const playDirect = useCallback((song: Song) => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    isFadingRef.current = false;
    setIsCrossfading(false);

    const deck = activeDeckRef.current;
    const otherDeck = deck === "A" ? "B" : "A";
    const activeAudio = deck === "A" ? audioRefA.current : audioRefB.current;
    const otherAudio = otherDeck === "A" ? audioRefA.current : audioRefB.current;

    if (otherAudio) {
      otherAudio.pause();
      otherAudio.currentTime = 0;
      otherAudio.volume = 1;
    }

    if (activeAudio) {
      activeAudio.src = song.file_url;
      activeAudio.volume = 1;
      activeAudio.currentTime = 0;
      activeAudio.play().catch((e) => console.warn("Play direct error:", e));
    }

    setCurrentSong(song);
    setIsPlaying(true);
    incrementPlayCount(song.id);

    historyRef.current.push(song.id);
    if (historyRef.current.length > 20) {
      historyRef.current.shift();
    }
  }, []);

  // 外部からの単曲再生指示
  const playSong = useCallback((song: Song, customPlaylist?: any[]) => {
    if (customPlaylist && customPlaylist.length > 0) {
      setPlaylist(customPlaylist);
    }

    const normalized = normalizeSong(song);
    if (currentSong?.id === normalized.id) {
      togglePlay();
      return;
    }

    playDirect(normalized);
  }, [currentSong, playDirect, setPlaylist]);

  // ランダム再生の開始
  const startRandomPlay = useCallback((songs: any[]) => {
    if (!songs || songs.length === 0) return;
    const normalizedList = songs.map(normalizeSong).filter((s) => s.file_url);
    if (normalizedList.length === 0) return;

    setPlaylistState(normalizedList);
    playlistRef.current = normalizedList;
    setIsRandom(true);
    isRandomRef.current = true;

    // ランダムな曲を選択
    const firstSong = normalizedList[Math.floor(Math.random() * normalizedList.length)];
    playDirect(firstSong);
  }, [playDirect]);

  // 次の曲へ進む（手動ボタン: 0.4秒の超クイックフェードで瞬時にスキップ）
  const playNextSong = useCallback(() => {
    const next = pickNextRandomSong();
    if (next) {
      executeCrossfade(next, 400);
    }
  }, [pickNextRandomSong, executeCrossfade]);

  // 前の曲へ戻る
  const playPrevSong = useCallback(() => {
    if (historyRef.current.length > 1) {
      // 直前の曲
      historyRef.current.pop(); // 現在の曲
      const prevId = historyRef.current.pop();
      const prevSong = playlistRef.current.find((s) => s.id === prevId);
      if (prevSong) {
        playDirect(prevSong);
        return;
      }
    }
    // なければランダム
    playNextSong();
  }, [playDirect, playNextSong]);

  // 再生 / 一時停止の切り替え
  const togglePlay = useCallback(() => {
    const activeAudio = activeDeckRef.current === "A" ? audioRefA.current : audioRefB.current;
    if (!activeAudio || !currentSong) return;

    if (isPlaying) {
      activeAudio.pause();
      setIsPlaying(false);
    } else {
      activeAudio.play().catch((e) => console.warn("Toggle play failed:", e));
      setIsPlaying(true);
    }
  }, [currentSong, isPlaying]);

  // ランダム再生モードのトグル
  const toggleRandom = useCallback(() => {
    setIsRandom((prev) => !prev);
  }, []);

  // シークバー操作
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const activeAudio = activeDeckRef.current === "A" ? audioRefA.current : audioRefB.current;
    if (!activeAudio || !activeAudio.duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    activeAudio.currentTime = percent * activeAudio.duration;
    setProgress(percent * 100);
  };

  // デッキイベントの登録と監視
  useEffect(() => {
    const setupDeckListeners = (audio: HTMLAudioElement | null, deckName: "A" | "B") => {
      if (!audio) return () => {};

      const onTimeUpdate = () => {
        // アクティブなデッキのみがプログレスとクロスフェード判定を担当
        if (activeDeckRef.current === deckName && !isFadingRef.current) {
          if (audio.duration) {
            setProgress((audio.currentTime / audio.duration) * 100 || 0);

            // ランダム再生中 & 曲の残り1.8秒以下で自然な1.5秒クロスフェード開始
            if (isRandomRef.current) {
              const timeLeft = audio.duration - audio.currentTime;
              if (timeLeft <= 1.8 && timeLeft > 0.3) {
                const next = pickNextRandomSong();
                if (next) {
                  executeCrossfade(next, 1500); // 1.5秒のスマートなクロスフェード
                }
              }
            }
          }
        }
      };

      const onPlay = () => {
        if (activeDeckRef.current === deckName) {
          setIsPlaying(true);
        }
      };

      const onPause = () => {
        if (activeDeckRef.current === deckName && !isFadingRef.current) {
          setIsPlaying(false);
        }
      };

      const onEnded = () => {
        if (activeDeckRef.current === deckName) {
          if (isRandomRef.current) {
            // クロスフェードがまだ始まっていない場合のフォールバック
            if (!isFadingRef.current) {
              const next = pickNextRandomSong();
              if (next) {
                playDirect(next);
              }
            }
          } else {
            setIsPlaying(false);
            setProgress(0);
          }
        }
      };

      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("play", onPlay);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("ended", onEnded);

      return () => {
        audio.removeEventListener("timeupdate", onTimeUpdate);
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("ended", onEnded);
      };
    };

    const cleanupA = setupDeckListeners(audioRefA.current, "A");
    const cleanupB = setupDeckListeners(audioRefB.current, "B");

    return () => {
      cleanupA();
      cleanupB();
    };
  }, [pickNextRandomSong, executeCrossfade, playDirect]);

  // バックグラウンド再生（MediaSession API）の対応
  useEffect(() => {
    if ("mediaSession" in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist || "AMU RECORDS",
        album: "AMU RECORDS",
        artwork: [
          {
            src: currentSong.cover_url || "/logo.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      });

      navigator.mediaSession.setActionHandler("play", () => togglePlay());
      navigator.mediaSession.setActionHandler("pause", () => togglePlay());
      navigator.mediaSession.setActionHandler("nexttrack", () => playNextSong());
      navigator.mediaSession.setActionHandler("previoustrack", () => playPrevSong());
    }
  }, [currentSong, togglePlay, playNextSong, playPrevSong]);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        isRandom,
        isCrossfading,
        playSong,
        togglePlay,
        toggleRandom,
        playNextSong,
        playPrevSong,
        startRandomPlay,
        setPlaylist,
      }}
    >
      {children}

      {/* Dual Deck Audio Elements (A and B for Crossfade) */}
      <audio ref={audioRefA} playsInline preload="auto" />
      <audio ref={audioRefB} playsInline preload="auto" />

      {/* グローバルプレイヤー（画面下部固定） */}
      {currentSong && (
        <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-2xl border-t border-slate-200/80 shadow-[0_-10px_35px_rgba(0,0,0,0.08)] z-[80] transition-all duration-300">
          {/* プログレスバー */}
          <div
            className="absolute top-0 left-0 w-full h-1.5 sm:h-2 bg-slate-100 cursor-pointer group"
            onClick={seek}
            title="シーク"
          >
            <div
              className={`h-full transition-all relative ${
                isCrossfading
                  ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse"
                  : "bg-indigo-600 group-hover:bg-indigo-500"
              }`}
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-indigo-700 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-6">
            {/* 楽曲メタ情報 */}
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl overflow-hidden bg-slate-100 shrink-0 shadow-sm border border-slate-200 relative group">
                {currentSong.cover_url ? (
                  <img src={currentSong.cover_url} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white font-bold text-xs">
                    AMU
                  </div>
                )}
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                  </div>
                )}
              </div>

              <div className="truncate min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-extrabold text-slate-900 truncate text-sm sm:text-base leading-snug">
                    {currentSong.title}
                  </h4>
                  {isCrossfading && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-gradient-to-r from-indigo-600 to-pink-600 text-white animate-pulse">
                      <span>✨</span>
                      <span>Crossfade</span>
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-500 truncate mt-0.5">
                  {currentSong.artist}
                </p>
              </div>
            </div>

            {/* 再生コントロール（シャッフル・前・再生・次・クロスフェード） */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {/* シャッフル / ランダム再生トグルボタン */}
              <button
                type="button"
                onClick={toggleRandom}
                title={isRandom ? "ランダム自動再生中 (クロスフェードON)" : "ランダム再生をONにする"}
                className={`p-2 sm:p-2.5 rounded-full transition-all active:scale-95 cursor-pointer relative ${
                  isRandom
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                </svg>
                {isRandom && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-pink-500 ring-2 ring-white"></span>
                )}
              </button>

              {/* 前の曲 */}
              <button
                type="button"
                onClick={playPrevSong}
                title="前の曲"
                className="hidden sm:flex p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>

              {/* 再生 / 一時停止 */}
              <button
                type="button"
                onClick={togglePlay}
                title={isPlaying ? "一時停止" : "再生"}
                className="w-11 h-11 sm:w-13 sm:h-13 flex items-center justify-center rounded-full bg-slate-900 hover:bg-slate-800 text-white active:scale-95 transition-all shadow-lg shadow-slate-900/20 cursor-pointer"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* 次の曲（クロスフェード送り） */}
              <button
                type="button"
                onClick={playNextSong}
                title="次の曲へ (クイックフェード)"
                className="p-2 sm:p-2.5 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </AudioPlayerContext.Provider>
  );
}
