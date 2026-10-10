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
  currentTime: number;
  duration: number;
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
  currentTime: 0,
  duration: 0,
  playSong: () => {},
  togglePlay: () => {},
  toggleRandom: () => {},
  playNextSong: () => {},
  playPrevSong: () => {},
  startRandomPlay: () => {},
  setPlaylist: () => {},
});

export const useAudioPlayer = () => useContext(AudioPlayerContext);

// 秒数を mm:ss 形式に整形
const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playlist, setPlaylistState] = useState<Song[]>([]);

  // シーク中のドラッグ状態
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // 再生履歴
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
  const nextSongRef = useRef<Song | null>(null);

  // Refを最新stateと同期
  useEffect(() => {
    isRandomRef.current = isRandom;
  }, [isRandom]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  // 再生回数のインクリメント（同じ端末・ブラウザからは1曲につき1日1回のみカウント）
  const incrementPlayCount = (songId: string) => {
    try {
      if (typeof window === "undefined") return;

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const storageKey = `amu_play_${songId}`;

      const lastPlayedDate = localStorage.getItem(storageKey);
      if (lastPlayedDate === todayStr) {
        // 今日すでにこの端末で再生カウント済みなのでスキップ
        return;
      }

      // 今日初めての再生：今日の日付を保存してカウントアップ
      localStorage.setItem(storageKey, todayStr);
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

    const currentId = currentSong?.id;
    const recentIds = new Set([currentId, ...historyRef.current.slice(-Math.min(5, list.length - 1))]);
    const candidates = list.filter((s) => !recentIds.has(s.id));

    const pool = candidates.length > 0 ? candidates : list.filter((s) => s.id !== currentId);
    if (pool.length === 0) return list[0];

    return pool[Math.floor(Math.random() * pool.length)];
  }, [currentSong]);

  // --- 自動進行時の本格的クロスフェード（曲終了前3.0秒間） ---
  const executeAutoCrossfade = useCallback((nextSong: Song) => {
    if (isFadingRef.current) return;

    const currentDeck = activeDeckRef.current;
    const nextDeck = currentDeck === "A" ? "B" : "A";
    const currentAudio = currentDeck === "A" ? audioRefA.current : audioRefB.current;
    const nextAudio = nextDeck === "A" ? audioRefA.current : audioRefB.current;

    if (!currentAudio || !nextAudio) return;

    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    isFadingRef.current = true;
    setIsCrossfading(true);

    // 次の曲のソースがプリロードされていなければセット
    if (!nextAudio.src || !nextAudio.src.includes(nextSong.file_url)) {
      nextAudio.src = nextSong.file_url;
      nextAudio.load();
    }
    nextAudio.volume = 0;
    nextAudio.currentTime = 0;

    let fadeStarted = false;

    const startFading = () => {
      if (fadeStarted) return;
      fadeStarted = true;

      setCurrentSong(nextSong);
      setProgress(0);
      setCurrentTime(0);
      activeDeckRef.current = nextDeck; // 即座にUI更新先を切り替え

      incrementPlayCount(nextSong.id);

      const DURATION_MS = 3000; // 3.0秒間の滑らかなフェード
      const STEPS = 60; // 50msごとに滑らかに更新
      const stepInterval = DURATION_MS / STEPS;
      let step = 0;

      fadeIntervalRef.current = setInterval(() => {
        step++;
        const ratio = Math.min(1, step / STEPS);

        // DJミキサー等で使われるEqual Power Curve (cos/sin) で音量の谷間を防止
        const outVolume = Math.max(0, Math.cos(ratio * 0.5 * Math.PI));
        const inVolume = Math.min(1, Math.sin(ratio * 0.5 * Math.PI));

        if (currentAudio) {
          try { currentAudio.volume = outVolume; } catch {}
        }
        if (nextAudio) {
          try { nextAudio.volume = inVolume; } catch {}
        }

        if (step >= STEPS) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;

          if (currentAudio) {
            currentAudio.pause();
            currentAudio.volume = 1;
            currentAudio.currentTime = 0;
          }
          if (nextAudio) {
            nextAudio.volume = 1;
          }

          isFadingRef.current = false;
          setIsCrossfading(false);

          historyRef.current.push(nextSong.id);
          if (historyRef.current.length > 20) {
            historyRef.current.shift();
          }

          // クロスフェード完了後、次の曲をプリロード
          setTimeout(() => {
            if (isRandomRef.current) {
              const next = pickNextRandomSong();
              if (next) {
                nextSongRef.current = next;
                if (currentAudio) {
                  currentAudio.src = next.file_url;
                  currentAudio.load();
                }
              }
            }
          }, 1500);
        }
      }, stepInterval);
    };

    const onPlaying = () => {
      nextAudio.removeEventListener("playing", onPlaying);
      startFading();
    };
    nextAudio.addEventListener("playing", onPlaying);

    const playPromise = nextAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        nextAudio.removeEventListener("playing", onPlaying);
        isFadingRef.current = false;
        setIsCrossfading(false);
      });
    }

    setTimeout(() => {
      if (!fadeStarted) {
        nextAudio.removeEventListener("playing", onPlaying);
        startFading();
      }
    }, 800); // プリロードが効いていれば即座に呼ばれる
  }, [pickNextRandomSong]);

  // --- 手動スキップ / 曲変更（手動時も滑らかなクロスフェード） ---
  const transitionToSong = useCallback((song: Song) => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    isFadingRef.current = false;
    setIsCrossfading(false);

    const currentDeck = activeDeckRef.current;
    const nextDeck = currentDeck === "A" ? "B" : "A";
    const currentAudio = currentDeck === "A" ? audioRefA.current : audioRefB.current;
    const nextAudio = nextDeck === "A" ? audioRefA.current : audioRefB.current;

    if (!nextAudio) return;

    // 前の曲がそもそも再生されていない場合（最初の再生や、一時停止中からの再生）は即座に再生する
    const isFirstPlayOrPaused = !currentAudio || currentAudio.paused || currentAudio.currentTime === 0;

    if (isFirstPlayOrPaused) {
      if (!nextAudio.src || !nextAudio.src.includes(song.file_url)) {
        nextAudio.src = song.file_url;
      }
      nextAudio.volume = 1;
      nextAudio.currentTime = 0;
      nextAudio.play().catch((e) => console.warn("Next play error:", e));

      activeDeckRef.current = nextDeck;
      setCurrentSong(song);
      setIsPlaying(true);
      setProgress(0);
      setCurrentTime(0);

      incrementPlayCount(song.id);
      historyRef.current.push(song.id);
      if (historyRef.current.length > 20) historyRef.current.shift();

      // スキップ後、次の曲をプリロード
      setTimeout(() => {
        if (isRandomRef.current) {
          const next = pickNextRandomSong();
          if (next) {
            nextSongRef.current = next;
            const idleDeck = activeDeckRef.current === "A" ? audioRefB.current : audioRefA.current;
            if (idleDeck) {
              idleDeck.src = next.file_url;
              idleDeck.load();
            }
          }
        }
      }, 1500);
      return;
    }

    // --- ここから手動スキップ時のクロスフェード処理（1.0秒） ---
    isFadingRef.current = true;
    setIsCrossfading(true);

    if (!nextAudio.src || !nextAudio.src.includes(song.file_url)) {
      nextAudio.src = song.file_url;
      nextAudio.load();
    }
    nextAudio.volume = 0;
    nextAudio.currentTime = 0;

    let fadeStarted = false;

    const startFading = () => {
      if (fadeStarted) return;
      fadeStarted = true;

      setCurrentSong(song);
      setIsPlaying(true);
      setProgress(0);
      setCurrentTime(0);
      activeDeckRef.current = nextDeck; // 即座にUI更新先を切り替え

      incrementPlayCount(song.id);

      const DURATION_MS = 1000; // 手動スキップ時はキビキビとした1.0秒フェード
      const STEPS = 20; // 50msごとに更新
      const stepInterval = DURATION_MS / STEPS;
      let step = 0;

      fadeIntervalRef.current = setInterval(() => {
        step++;
        const ratio = Math.min(1, step / STEPS);

        const outVolume = Math.max(0, Math.cos(ratio * 0.5 * Math.PI));
        const inVolume = Math.min(1, Math.sin(ratio * 0.5 * Math.PI));

        if (currentAudio) {
          try { currentAudio.volume = outVolume; } catch {}
        }
        if (nextAudio) {
          try { nextAudio.volume = inVolume; } catch {}
        }

        if (step >= STEPS) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;

          if (currentAudio) {
            currentAudio.pause();
            currentAudio.volume = 1;
            currentAudio.currentTime = 0;
          }
          if (nextAudio) {
            nextAudio.volume = 1;
          }

          isFadingRef.current = false;
          setIsCrossfading(false);

          historyRef.current.push(song.id);
          if (historyRef.current.length > 20) {
            historyRef.current.shift();
          }

          // クロスフェード完了後、次の曲をプリロード
          setTimeout(() => {
            if (isRandomRef.current) {
              const next = pickNextRandomSong();
              if (next) {
                nextSongRef.current = next;
                if (currentAudio) {
                  currentAudio.src = next.file_url;
                  currentAudio.load();
                }
              }
            }
          }, 1500);
        }
      }, stepInterval);
    };

    const onPlaying = () => {
      nextAudio.removeEventListener("playing", onPlaying);
      startFading();
    };
    nextAudio.addEventListener("playing", onPlaying);

    const playPromise = nextAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn("Manual skip play error:", e);
        nextAudio.removeEventListener("playing", onPlaying);
        isFadingRef.current = false;
        setIsCrossfading(false);
      });
    }

    setTimeout(() => {
      if (!fadeStarted) {
        nextAudio.removeEventListener("playing", onPlaying);
        startFading();
      }
    }, 500);
  }, [pickNextRandomSong]);

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

    transitionToSong(normalized);
  }, [currentSong, transitionToSong, setPlaylist]);

  // ランダム再生の開始
  const startRandomPlay = useCallback((songs: any[]) => {
    if (!songs || songs.length === 0) return;
    const normalizedList = songs.map(normalizeSong).filter((s) => s.file_url);
    if (normalizedList.length === 0) return;

    setPlaylistState(normalizedList);
    playlistRef.current = normalizedList;
    setIsRandom(true);
    isRandomRef.current = true;

    const firstSong = normalizedList[Math.floor(Math.random() * normalizedList.length)];
    transitionToSong(firstSong);
  }, [transitionToSong]);

  // 手動スキップ（次の曲へ）
  const playNextSong = useCallback(() => {
    if (isRandomRef.current && nextSongRef.current) {
      const next = nextSongRef.current;
      nextSongRef.current = null;
      transitionToSong(next);
    } else {
      const next = pickNextRandomSong();
      if (next) {
        transitionToSong(next);
      }
    }
  }, [pickNextRandomSong, transitionToSong]);

  // 前の曲へ戻る
  const playPrevSong = useCallback(() => {
    if (historyRef.current.length > 1) {
      historyRef.current.pop();
      const prevId = historyRef.current.pop();
      const prevSong = playlistRef.current.find((s) => s.id === prevId);
      if (prevSong) {
        transitionToSong(prevSong);
        return;
      }
    }
    playNextSong();
  }, [transitionToSong, playNextSong]);

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

  // --- 高精度・快適シークバー操作（Pointer Events対応） ---
  const calculateProgressFromPointer = (e: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const rawRatio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, rawRatio));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const activeAudio = activeDeckRef.current === "A" ? audioRefA.current : audioRefB.current;
    if (!activeAudio || !activeAudio.duration) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);

    const ratio = calculateProgressFromPointer(e);
    setDragProgress(ratio * 100);
    setCurrentTime(ratio * activeAudio.duration);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const activeAudio = activeDeckRef.current === "A" ? audioRefA.current : audioRefB.current;
    if (!activeAudio || !activeAudio.duration) return;

    const ratio = calculateProgressFromPointer(e);
    setDragProgress(ratio * 100);
    setCurrentTime(ratio * activeAudio.duration);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);

    const activeAudio = activeDeckRef.current === "A" ? audioRefA.current : audioRefB.current;
    if (!activeAudio || !activeAudio.duration) return;

    const ratio = calculateProgressFromPointer(e);
    const targetTime = ratio * activeAudio.duration;
    activeAudio.currentTime = targetTime;
    setProgress(ratio * 100);
    setCurrentTime(targetTime);
  };

  // デッキイベントの登録と監視
  useEffect(() => {
    const setupDeckListeners = (audio: HTMLAudioElement | null, deckName: "A" | "B") => {
      if (!audio) return () => {};

      const onTimeUpdate = () => {
        if (activeDeckRef.current === deckName) {
          if (audio.duration) {
            setDuration(audio.duration);
            if (!isDragging) {
              setCurrentTime(audio.currentTime);
              setProgress((audio.currentTime / audio.duration) * 100 || 0);
            }

            // ランダム再生中 & 曲の残り3.5秒以下で3.0秒間の滑らかな自動クロスフェード開始
            if (isRandomRef.current && !isFadingRef.current) {
              const timeLeft = audio.duration - audio.currentTime;
              if (timeLeft <= 3.5 && timeLeft > 0.5) {
                if (nextSongRef.current) {
                  executeAutoCrossfade(nextSongRef.current);
                  nextSongRef.current = null;
                } else {
                  const next = pickNextRandomSong();
                  if (next) {
                    executeAutoCrossfade(next);
                  }
                }
              }
            }
          }
        }
      };

      const onLoadedMetadata = () => {
        if (activeDeckRef.current === deckName && audio.duration) {
          setDuration(audio.duration);
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
            if (!isFadingRef.current) {
              if (nextSongRef.current) {
                const next = nextSongRef.current;
                nextSongRef.current = null;
                transitionToSong(next);
              } else {
                const next = pickNextRandomSong();
                if (next) {
                  transitionToSong(next);
                }
              }
            }
          } else {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
          }
        }
      };

      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("loadedmetadata", onLoadedMetadata);
      audio.addEventListener("play", onPlay);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("ended", onEnded);

      return () => {
        audio.removeEventListener("timeupdate", onTimeUpdate);
        audio.removeEventListener("loadedmetadata", onLoadedMetadata);
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
  }, [isDragging, pickNextRandomSong, executeAutoCrossfade, transitionToSong]);

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

  const displayProgress = isDragging ? dragProgress : progress;

  return (
    <AudioPlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        isRandom,
        isCrossfading,
        currentTime,
        duration,
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

      {/* Dual Deck Audio Elements */}
      <audio ref={audioRefA} playsInline preload="auto" />
      <audio ref={audioRefB} playsInline preload="auto" />

      {/* グローバルプレイヤー（画面下部固定） */}
      {currentSong && (
        <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-2xl border-t border-slate-200/90 shadow-[0_-10px_35px_rgba(0,0,0,0.08)] z-[80] transition-all duration-300">
          {/* 超快適シークバー（広いタップ＆ドラッグ当たり判定エリア） */}
          <div
            ref={progressBarRef}
            className="absolute -top-3.5 left-0 w-full h-8 flex items-center cursor-pointer group touch-none select-none z-10"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            title="ドラッグまたはタップでシーク"
          >
            {/* シークバー本体のトラック */}
            <div className="w-full h-1.5 sm:h-2 bg-slate-200/80 group-hover:h-2.5 transition-all relative overflow-visible">
              {/* 再生済みバー */}
              <div
                className={`h-full relative ${
                  isCrossfading
                    ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse"
                    : "bg-indigo-600 group-hover:bg-indigo-500"
                }`}
                style={{ width: `${displayProgress}%` }}
              >
                {/* つまみ（ハンドル） */}
                <div
                  className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full bg-white border-2 border-indigo-600 shadow-md transition-all ${
                    isDragging ? "w-4 h-4 scale-125" : "w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-90 group-hover:opacity-100 group-hover:scale-110"
                  }`}
                />
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-3.5 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2.5 sm:gap-6">
            {/* 楽曲メタ情報 */}
            <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
              <div className="w-10 h-10 sm:w-13 sm:h-13 rounded-xl sm:rounded-2xl overflow-hidden bg-slate-100 shrink-0 shadow-sm border border-slate-200 relative group">
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
                  <h4 className="font-extrabold text-slate-900 truncate text-xs sm:text-base leading-snug">
                    {currentSong.title}
                  </h4>
                  {isCrossfading && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black bg-gradient-to-r from-indigo-600 to-pink-600 text-white animate-pulse">
                      <span>✨</span>
                      <span>Crossfade</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 truncate mt-0.5">
                  <span className="truncate">{currentSong.artist}</span>
                  {duration > 0 && (
                    <span className="text-[11px] text-slate-400 font-mono shrink-0 hidden xs:inline">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 再生コントロール（シャッフル・前・再生・次） */}
            <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
              {/* 時間表示（モバイル向けインライン表示） */}
              {duration > 0 && (
                <span className="text-[10px] sm:text-xs text-slate-400 font-mono shrink-0 pr-1 select-none xs:hidden">
                  {formatTime(currentTime)}
                </span>
              )}

              {/* シャッフル / ランダム再生トグルボタン */}
              <button
                type="button"
                onClick={toggleRandom}
                title={isRandom ? "ランダム自動再生中 (ON)" : "ランダム再生をONにする"}
                className={`p-1.5 sm:p-2.5 rounded-full transition-all active:scale-95 cursor-pointer relative ${
                  isRandom
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                </svg>
                {isRandom && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-pink-500 ring-2 ring-white"></span>
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
                className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-slate-900 hover:bg-slate-800 text-white active:scale-95 transition-all shadow-md shadow-slate-900/20 cursor-pointer"
              >
                {isPlaying ? (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* 次の曲（手動スキップ） */}
              <button
                type="button"
                onClick={playNextSong}
                title="次の曲へ"
                className="p-1.5 sm:p-2.5 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
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
