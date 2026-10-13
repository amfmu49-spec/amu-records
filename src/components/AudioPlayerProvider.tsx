"use client";

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getCachedAudioUrl, preloadAudioToCache } from "@/utils/audioCache";
import { toCdnUrl } from "@/utils/cdn";
import { calculateSupporterRank, SupporterRankInfo } from "@/utils/supporterRank";

export type Song = {
  id: string;
  title: string;
  file_url: string;
  cover_url: string | null;
  artist?: string;
  synced_lyrics?: string | null;
  user_id?: string;
  co_artist_id_1?: string;
  co_artist_id_2?: string;
};

type AudioPlayerContextType = {
  currentSong: Song | null;
  isPlaying: boolean;
  isRandom: boolean;
  isCrossfading: boolean;
  currentTime: number;
  duration: number;
  isLiveMode: boolean;
  toggleLiveMode: () => void;
  triggerCheer: () => void;
  currentCheerToast: { name: string; id: string } | null;
  supporterRankInfo: SupporterRankInfo;
  refreshSupporterRank: () => Promise<void>;
  playSong: (song: Song, playlist?: any[]) => void;
  seekTo: (seconds: number) => void;
  togglePlay: () => void;
  toggleRandom: () => void;
  setIsRandom: (val: boolean) => void;
  playNextSong: () => void;
  playPrevSong: () => void;
  startRandomPlay: (songs: any[]) => void;
  setPlaylist: (songs: any[]) => void;
  getExactTime: () => number;
};

const AudioPlayerContext = createContext<AudioPlayerContextType>({
  currentSong: null,
  isPlaying: false,
  isRandom: false,
  isCrossfading: false,
  isLiveMode: false,
  toggleLiveMode: () => {},
  triggerCheer: () => {},
  currentCheerToast: null,
  currentTime: 0,
  duration: 0,
  supporterRankInfo: calculateSupporterRank([]),
  refreshSupporterRank: async () => {},
  playSong: () => {},
  seekTo: () => {},
  togglePlay: () => {},
  toggleRandom: () => {},
  setIsRandom: () => {},
  playNextSong: () => {},
  playPrevSong: () => {},
  startRandomPlay: () => {},
  setPlaylist: () => {},
  getExactTime: () => 0,
});

export const useAudioPlayer = () => useContext(AudioPlayerContext);

// LIVEモード 大ホール・アリーナ大歓声バリエーションリスト（遠距離残響・大群衆・スタジアム音響）
export const LIVE_CHEERS = [
  { id: "arena_stadium", name: "スタジアム大歓声", src: "/sounds/live/cheer_arena_stadium1.mp3?v=hall2" },
  { id: "arena_buzz", name: "アリーナ大熱狂の歓声", src: "/sounds/live/cheer_arena_buzz1.mp3?v=hall2" },
  { id: "arena_applause", name: "大ホール万雷の拍手喝采", src: "/sounds/live/cheer_arena_applause1.mp3?v=hall2" },
  { id: "hall_perf1", name: "大公演オーディエンス歓声", src: "/sounds/live/cheer_hall_performance1.mp3?v=hall2" },
  { id: "hall_perf2", name: "コンサートホール喝采", src: "/sounds/live/cheer_hall_performance2.mp3?v=hall2" },
];

/**
 * Web Audio API 用の広大なコンサートホール・スタジアム合成インパルスレスポンス
 */
function createHallImpulse(ctx: AudioContext, duration = 2.8, decay = 3.0): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  // 初期反射パルス（大ホールの壁・反響板からの初期反射）
  const reflections = [
    { delay: 0.016, gain: 0.65, pan: -0.4 },
    { delay: 0.029, gain: 0.55, pan: 0.5 },
    { delay: 0.043, gain: 0.45, pan: -0.3 },
    { delay: 0.062, gain: 0.38, pan: 0.35 },
    { delay: 0.088, gain: 0.32, pan: -0.2 },
    { delay: 0.115, gain: 0.28, pan: 0.25 },
  ];

  for (const r of reflections) {
    const idx = Math.floor(r.delay * sampleRate);
    if (idx < length) {
      left[idx] += r.gain * (1 - r.pan * 0.5);
      right[idx] += r.gain * (1 + r.pan * 0.5);
    }
  }

  // 後期残響（指数関数的減衰ノイズ＋ステレオ拡散）
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const envelope = Math.pow(1 - t, decay);
    left[i] += (Math.random() * 2 - 1) * envelope * 0.6;
    right[i] += (Math.random() * 2 - 1) * envelope * 0.6;
  }

  return impulse;
}

// 秒数を mm:ss 形式に整形
const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

// 任意の曲オブジェクトを正規化
const normalizeSong = (item: any): Song => {
  if (!item) return { id: "", title: "", file_url: "", cover_url: null, artist: "", synced_lyrics: null };
  const userId = item.user_id || undefined;
  const coArtist1 = item.co_artist_id_1 || undefined;
  const coArtist2 = item.co_artist_id_2 || undefined;

  if (item.artist && item.file_url && typeof item.artist === "string") {
    return {
      id: item.id,
      title: item.title,
      file_url: toCdnUrl(item.file_url),
      cover_url: item.cover_url ? toCdnUrl(item.cover_url) : null,
      artist: item.artist,
      synced_lyrics: item.synced_lyrics || null,
      user_id: userId,
      co_artist_id_1: coArtist1,
      co_artist_id_2: coArtist2,
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
    file_url: toCdnUrl(item.file_url),
    cover_url: item.cover_url ? toCdnUrl(item.cover_url) : null,
    artist: artistName,
    synced_lyrics: item.synced_lyrics || null,
    user_id: userId,
    co_artist_id_1: coArtist1,
    co_artist_id_2: coArtist2,
  };
};

export default function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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

  // --- LIVEモード（大ホールリバーブ ＆ 演奏開始歓声） ---
  const [isLiveMode, setIsLiveMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("amu_live_mode") === "true";
      } catch {}
    }
    return false;
  });
  const isLiveModeRef = useRef<boolean>(isLiveMode);
  const audioContextRef = useRef<AudioContext | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const cheerBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const activeCheerGainRef = useRef<GainNode | null>(null);
  const activeCheerSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isWebAudioConnectedRef = useRef(false);

  // 歓声（Cheering）関連のRefと状態
  const lastCheerIdRef = useRef<string | null>(null);
  const cheerAudioRef = useRef<HTMLAudioElement | null>(null);
  const cheerFadeIntervalRef = useRef<any>(null);
  const [currentCheerToast, setCurrentCheerToast] = useState<{ name: string; id: string } | null>(null);

  useEffect(() => {
    isLiveModeRef.current = isLiveMode;
  }, [isLiveMode]);

  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Web Audio API による大ホールリバーブの初期化
  const initWebAudio = useCallback(() => {
    if (typeof window === "undefined") return;
    if (isWebAudioConnectedRef.current && audioContextRef.current) {
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      return;
    }

    const audioA = audioRefA.current;
    const audioB = audioRefB.current;
    if (!audioA || !audioB) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      // 再生中にコンテキストが中断（バックグラウンド・割り込み等）されたら自動で復帰させる
      ctx.onstatechange = () => {
        if (ctx.state !== "running" && isPlayingRef.current) {
          ctx.resume().catch(() => {});
        }
      };

      // Deck A & B のソースを作成（※各要素につき1回のみ実行）
      const sourceA = ctx.createMediaElementSource(audioA);
      const sourceB = ctx.createMediaElementSource(audioB);

      // 入力マージ
      const inputMerger = ctx.createGain();
      sourceA.connect(inputMerger);
      sourceB.connect(inputMerger);

      // 原音（Dry）ライン
      const dryGain = ctx.createGain();
      dryGain.gain.value = isLiveModeRef.current ? 0.82 : 1.0;
      dryGainRef.current = dryGain;
      inputMerger.connect(dryGain);
      dryGain.connect(ctx.destination);

      // リバーブ（Wet）ライン: 3.8kHz LPF -> Convolver -> wetGain -> destination
      const preFilter = ctx.createBiquadFilter();
      preFilter.type = "lowpass";
      preFilter.frequency.value = 3800; // ホールの空気・反響板による高域吸収
      preFilter.Q.value = 0.7;

      const convolver = ctx.createConvolver();
      convolver.buffer = createHallImpulse(ctx, 3.2, 2.8);
      convolverRef.current = convolver;

      const wetGain = ctx.createGain();
      wetGain.gain.value = isLiveModeRef.current ? 0.52 : 0;
      wetGainRef.current = wetGain;

      inputMerger.connect(preFilter);
      preFilter.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(ctx.destination);

      isWebAudioConnectedRef.current = true;

      // 歓声オーディオをバックグラウンドでデコード＆キャッシュ（初回再生時の遅延完全ゼロ化）
      LIVE_CHEERS.forEach((c) => {
        fetch(c.src)
          .then((res) => res.arrayBuffer())
          .then((ab) => ctx.decodeAudioData(ab))
          .then((decoded) => {
            cheerBufferCacheRef.current.set(c.src, decoded);
          })
          .catch(() => {});
      });

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    } catch (err) {
      console.warn("Web Audio Reverb init fallback:", err);
    }
  }, []);

  // リバーブの音量を滑らかに切り替え（クリックノイズなし）
  const updateReverbState = useCallback((liveActive: boolean) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    if (dryGainRef.current) {
      dryGainRef.current.gain.setTargetAtTime(liveActive ? 0.82 : 1.0, now, 0.08);
    }
    if (wetGainRef.current) {
      wetGainRef.current.gain.setTargetAtTime(liveActive ? 0.52 : 0.0, now, 0.08);
    }
  }, []);

  // オーディオ要素を滑らかにフェードアウトさせて安全に停止するヘルパー（ぶつ切り完全防止）
  const fadeOutAudio = useCallback((audio: HTMLAudioElement | null, durationMs = 800) => {
    if (!audio) return;
    const startVolume = audio.volume;
    if (startVolume <= 0.02) {
      try { audio.pause(); } catch {}
      return;
    }

    const steps = 25;
    const stepInterval = durationMs / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const ratio = 1 - (step / steps);
      try {
        audio.volume = Math.max(0, startVolume * ratio);
      } catch {}

      if (step >= steps || audio.volume <= 0.01) {
        clearInterval(interval);
        try {
          audio.pause();
          audio.volume = 0;
        } catch {}
      }
    }, stepInterval);
  }, []);

  // 歓声SEの再生（大ホール・アリーナの広大な空間音響 ＆ 遠距離残響エフェクト）
  const playLiveCheer = useCallback(async (isSongStart = true) => {
    if (typeof window === "undefined") return;

    // 前回の歓声と被らないようにランダム選択
    const candidates = LIVE_CHEERS.filter((c) => c.id !== lastCheerIdRef.current);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || LIVE_CHEERS[0];
    lastCheerIdRef.current = chosen.id;

    // トースト通知を表示（3.2秒間）
    setCurrentCheerToast({ name: chosen.name, id: chosen.id });
    setTimeout(() => {
      setCurrentCheerToast((prev) => (prev?.id === chosen.id ? null : prev));
    }, 3200);

    initWebAudio();
    const ctx = audioContextRef.current;

    // 以前の歓声再生がある場合は、即座に切らず滑らかにフェードアウト！
    if (activeCheerGainRef.current && ctx) {
      try {
        const now = ctx.currentTime;
        activeCheerGainRef.current.gain.cancelScheduledValues(now);
        activeCheerGainRef.current.gain.setTargetAtTime(0.0001, now, 0.2);
      } catch {}
    }
    if (cheerFadeIntervalRef.current) {
      clearInterval(cheerFadeIntervalRef.current);
      cheerFadeIntervalRef.current = null;
    }
    if (cheerAudioRef.current) {
      fadeOutAudio(cheerAudioRef.current, 500);
    }

    try {
      if (ctx) {
        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }

        // バッファ取得（未キャッシュなら即時ロード＆デコード）
        let buffer = cheerBufferCacheRef.current.get(chosen.src);
        if (!buffer) {
          const res = await fetch(chosen.src);
          const arrayBuffer = await res.arrayBuffer();
          buffer = await ctx.decodeAudioData(arrayBuffer);
          cheerBufferCacheRef.current.set(chosen.src, buffer);
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        activeCheerSourceRef.current = source;

        // 1. マスター歓声Gain（迫力のある大歓声：0.75でしっかりとした音圧と臨場感）
        const masterGain = ctx.createGain();
        activeCheerGainRef.current = masterGain;

        // 2. 空間・音響フィルター（Low-pass Filter 5200Hz）
        // 篭りすぎを解消しつつ、至近距離の極端な耳障りさだけを取り除き、
        // スタジアム・大ホールの拍手の抜けと歓声の明るい高揚感をリアルに再現
        const distanceFilter = ctx.createBiquadFilter();
        distanceFilter.type = "lowpass";
        distanceFilter.frequency.value = 5200;
        distanceFilter.Q.value = 0.7;

        source.connect(masterGain);
        masterGain.connect(distanceFilter);

        // 3. 直接音（Dry 55%）とホール残響（Wet 90%）の空間ブレンド
        // オーディエンスの生の歓声・拍手の芯をしっかり立たせ、
        // 大ホール・コンボリューションリバーブと合わさって会場全体を包み込む音場を創出
        const dryCheerGain = ctx.createGain();
        dryCheerGain.gain.value = 0.55;
        distanceFilter.connect(dryCheerGain);
        dryCheerGain.connect(ctx.destination);

        if (convolverRef.current) {
          const wetCheerGain = ctx.createGain();
          wetCheerGain.gain.value = 0.90;
          distanceFilter.connect(wetCheerGain);
          wetCheerGain.connect(convolverRef.current);
        }

        const now = ctx.currentTime;
        const initialVol = 0.75;

        if (isSongStart) {
          // 演奏開始時：2.5秒間しっかり会場全体を熱狂の大歓声で包み、その後自然に指数フェードアウト
          masterGain.gain.setValueAtTime(initialVol, now);
          masterGain.gain.setValueAtTime(initialVol, now + 2.5);
          masterGain.gain.setTargetAtTime(0.0001, now + 2.5, 1.4);
        } else {
          // 手動時
          masterGain.gain.setValueAtTime(initialVol, now);
          masterGain.gain.setTargetAtTime(0.0001, now + 1.2, 1.0);
        }

        source.start(now);
        return;
      }
    } catch (e) {
      console.warn("Web Audio cheer playback fallback:", e);
    }

    // Web Audio非対応環境向けの安全なフォールバック
    try {
      const audio = new Audio(chosen.src);
      cheerAudioRef.current = audio;
      const initialVol = 0.75;
      audio.volume = initialVol;
      audio.currentTime = 0;
      const p = audio.play();
      if (p !== undefined) p.catch(() => {});

      if (isSongStart) {
        setTimeout(() => {
          fadeOutAudio(audio, 4000);
        }, 2500);
      }
    } catch (e) {
      console.warn("Cheer audio play error:", e);
    }
  }, [initWebAudio, fadeOutAudio]);

  // LIVEモードのON/OFF切り替え
  const toggleLiveMode = useCallback(() => {
    setIsLiveMode((prev) => {
      const next = !prev;
      isLiveModeRef.current = next;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("amu_live_mode", String(next));
        } catch {}
      }

      initWebAudio();
      updateReverbState(next);

      // LIVEモードをONにした瞬間に曲が再生中なら、即座に歓声も入れて盛り上げる！
      if (next) {
        playLiveCheer(true);
      } else {
        // OFFにした時は鳴っている歓声も滑らかにフェードアウト
        if (activeCheerGainRef.current && audioContextRef.current) {
          try {
            const now = audioContextRef.current.currentTime;
            activeCheerGainRef.current.gain.cancelScheduledValues(now);
            activeCheerGainRef.current.gain.setTargetAtTime(0.0001, now, 0.2);
          } catch {}
        }
        if (cheerAudioRef.current) {
          fadeOutAudio(cheerAudioRef.current, 600);
        }
      }
      return next;
    });
  }, [initWebAudio, updateReverbState, playLiveCheer, fadeOutAudio]);

  // 手動で歓声を送る（ライブ中にペンライトを振るような感覚）
  const triggerCheer = useCallback(() => {
    initWebAudio();
    playLiveCheer(false);
  }, [initWebAudio, playLiveCheer]);

  // プレイヤー専用：ログインユーザー情報、現在の曲のいいね・コメント状態、サポーターランク情報
  const [currentUser, setCurrentUser] = useState<any>(null);
  const currentUserRef = useRef<any>(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const [currentLikes, setCurrentLikes] = useState<{ isLiked: boolean; count: number }>({ isLiked: false, count: 0 });
  const [currentCommentsCount, setCurrentCommentsCount] = useState<number>(0);
  const [supporterRankInfo, setSupporterRankInfo] = useState<SupporterRankInfo>(() => calculateSupporterRank([]));
  const isLikingRef = useRef(false);

  // ユーザーのサポーターランクを取得・再計算
  const refreshSupporterRank = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const supabase = createClient();
      const { data: userLikes } = await supabase
        .from("likes")
        .select("created_at")
        .eq("user_id", currentUser.id);

      const info = calculateSupporterRank(userLikes || []);
      setSupporterRankInfo(info);
    } catch (err) {
      console.warn("Failed to refresh supporter rank:", err);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user);
    });
  }, []);

  useEffect(() => {
    if (currentUser?.id) {
      refreshSupporterRank();
    }
  }, [currentUser?.id, refreshSupporterRank]);

  useEffect(() => {
    if (!currentSong?.id) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("likes").select("user_id").eq("song_id", currentSong.id),
      supabase.from("amu_comments").select("id", { count: "exact", head: true }).eq("song_id", currentSong.id),
    ]).then(([likesRes, commentsRes]) => {
      const likes = likesRes.data || [];
      setCurrentLikes({
        isLiked: currentUser ? likes.some((l: any) => l.user_id === currentUser.id) : false,
        count: likes.length,
      });
      setCurrentCommentsCount(commentsRes.count || 0);
    });
  }, [currentSong?.id, currentUser?.id]);

  const toggleCurrentLike = async () => {
    if (!currentUser) {
      alert("いいねするにはログインしてください");
      return;
    }
    if (!currentSong) return;
    if (isLikingRef.current) return; // 二重クリック・通信重複を完全防止！

    try {
      isLikingRef.current = true;
      const newIsLiked = !currentLikes.isLiked;
      const newCount = newIsLiked ? currentLikes.count + 1 : Math.max(0, currentLikes.count - 1);
      setCurrentLikes({ isLiked: newIsLiked, count: newCount });

      const supabase = createClient();
      if (newIsLiked) {
        await supabase.from("likes").insert({ user_id: currentUser.id, song_id: currentSong.id });
      } else {
        await supabase.from("likes").delete().eq("user_id", currentUser.id).eq("song_id", currentSong.id);
      }

      // サポーターランクをリアルタイム再計算＆反映
      await refreshSupporterRank();
    } catch (err) {
      console.error("Like toggle error:", err);
    } finally {
      isLikingRef.current = false;
    }
  };

  // 再生回数のインクリメント（同じ端末・ブラウザからは1曲につき1日1回のみカウント。作者・コラボアーティスト本人の再生は除外）
  const incrementPlayCount = async (song: Song) => {
    try {
      if (typeof window === "undefined" || !song?.id) return;

      const songId = song.id;
      const supabase = createClient();

      // 現在のログインユーザーを取得
      let currentUid = currentUserRef.current?.id || currentUser?.id;
      if (!currentUid) {
        const { data: sessionData } = await supabase.auth.getSession();
        currentUid = sessionData.session?.user?.id;
      }

      // 曲の作者情報を確認（songオブジェクトに無い場合はDBから即座に確認）
      let songUserId = song.user_id;
      let co1 = song.co_artist_id_1;
      let co2 = song.co_artist_id_2;

      if (currentUid && !songUserId) {
        const { data: songData } = await supabase
          .from("songs")
          .select("user_id, co_artist_id_1, co_artist_id_2")
          .eq("id", songId)
          .single();
        if (songData) {
          songUserId = songData.user_id;
          co1 = songData.co_artist_id_1;
          co2 = songData.co_artist_id_2;
        }
      }

      // 作者自身・コラボアーティスト自身による再生は再生回数にカウントしない（自演再生完全防止）
      if (currentUid && (songUserId === currentUid || co1 === currentUid || co2 === currentUid)) {
        return;
      }

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
    // バックグラウンドで先頭3曲を自動キャッシュ（Supabase通信量の削減 & 爆速化）
    normalized.slice(0, 3).forEach((s) => preloadAudioToCache(s.file_url));
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
  const executeAutoCrossfade = useCallback(async (nextSong: Song) => {
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

    // キャッシュ済みのBlob URLを取得（未キャッシュなら即座に直接URLを返し裏でキャッシュ）
    const audioUrlToPlay = await getCachedAudioUrl(nextSong.file_url);

    // 次の曲のソースがプリロードされていなければセット
    if (!nextAudio.src || (!nextAudio.src.includes(audioUrlToPlay) && !nextAudio.src.includes(nextSong.file_url))) {
      nextAudio.src = audioUrlToPlay;
      nextAudio.load();
    }
    nextAudio.volume = 0;
    nextAudio.currentTime = 0;

    let fadeStarted = false;

    const startFading = () => {
      if (fadeStarted) return;
      fadeStarted = true;

      if (isLiveModeRef.current) {
        initWebAudio();
        playLiveCheer(true);
      }

      setCurrentSong(nextSong);
      setProgress(0);
      setCurrentTime(0);
      activeDeckRef.current = nextDeck; // 即座にUI更新先を切り替え

      incrementPlayCount(nextSong);

      const DURATION_MS = 3000; // 3.0秒間の滑らかなフェード
      const STEPS = 60; // 50msごとに滑らかに更新
      const stepInterval = DURATION_MS / STEPS;
      // バックグラウンド時はタイマー間引きでフェードが終わらず無音になるため即時切り替え
      const isBackground = typeof document !== "undefined" && document.hidden;
      const fadeStartTime = Date.now();

      const fadeTick = () => {
        const ratio = isBackground ? 1 : Math.min(1, (Date.now() - fadeStartTime) / DURATION_MS);

        // DJミキサー等で使われるEqual Power Curve (cos/sin) で音量の谷間を防止
        const outVolume = Math.max(0, Math.cos(ratio * 0.5 * Math.PI));
        const inVolume = Math.min(1, Math.sin(ratio * 0.5 * Math.PI));

        if (currentAudio) {
          try { currentAudio.volume = outVolume; } catch {}
        }
        if (nextAudio) {
          try { nextAudio.volume = inVolume; } catch {}
        }

        if (ratio >= 1) {
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

          // クロスフェード完了後、次の曲をプリロード＆キャッシュ
          setTimeout(async () => {
            if (isRandomRef.current) {
              const next = pickNextRandomSong();
              if (next) {
                nextSongRef.current = next;
                preloadAudioToCache(next.file_url);
                const preloadUrl = await getCachedAudioUrl(next.file_url);
                if (currentAudio) {
                  currentAudio.src = preloadUrl;
                  currentAudio.load();
                }
              }
            }
          }, 1500);
        }
      };
      fadeIntervalRef.current = setInterval(fadeTick, stepInterval);
      if (isBackground) fadeTick();
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
  }, [pickNextRandomSong, initWebAudio, playLiveCheer]);

  // --- 手動スキップ / 曲変更（手動時も滑らかなクロスフェード） ---
  const transitionToSong = useCallback(async (song: Song) => {
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

    // キャッシュ済みのBlob URLを取得
    const audioUrlToPlay = await getCachedAudioUrl(song.file_url);

    // 前の曲がそもそも再生されていない場合（最初の再生や、一時停止中からの再生）は即座に再生する
    const isFirstPlayOrPaused = !currentAudio || currentAudio.paused || currentAudio.currentTime === 0;

    if (isFirstPlayOrPaused) {
      if (!nextAudio.src || (!nextAudio.src.includes(audioUrlToPlay) && !nextAudio.src.includes(song.file_url))) {
        nextAudio.src = audioUrlToPlay;
      }
      nextAudio.volume = 1;
      nextAudio.currentTime = 0;
      nextAudio.play().catch((e) => {
        console.warn("Next play error:", e);
        // iOS等：バックグラウンドでは別の<audio>要素の再生が拒否されることがあるため、
        // 再生許可済みの同じ要素に次の曲を読み込んで継続再生する
        if (currentAudio && currentAudio !== nextAudio) {
          try {
            currentAudio.src = audioUrlToPlay;
            currentAudio.volume = 1;
            currentAudio.currentTime = 0;
            activeDeckRef.current = currentDeck;
            currentAudio.play().catch(() => {});
          } catch {}
        }
      });

      if (isLiveModeRef.current) {
        initWebAudio();
        playLiveCheer(true);
      }

      activeDeckRef.current = nextDeck;
      setCurrentSong(song);
      setIsPlaying(true);
      setProgress(0);
      setCurrentTime(0);

      incrementPlayCount(song);
      historyRef.current.push(song.id);
      if (historyRef.current.length > 20) historyRef.current.shift();

      // スキップ後、次の曲をプリロード＆キャッシュ
      setTimeout(async () => {
        if (isRandomRef.current) {
          const next = pickNextRandomSong();
          if (next) {
            nextSongRef.current = next;
            preloadAudioToCache(next.file_url);
            const preloadUrl = await getCachedAudioUrl(next.file_url);
            const idleDeck = activeDeckRef.current === "A" ? audioRefB.current : audioRefA.current;
            if (idleDeck) {
              idleDeck.src = preloadUrl;
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

    if (!nextAudio.src || (!nextAudio.src.includes(audioUrlToPlay) && !nextAudio.src.includes(song.file_url))) {
      nextAudio.src = audioUrlToPlay;
      nextAudio.load();
    }
    nextAudio.volume = 0;
    nextAudio.currentTime = 0;

    let fadeStarted = false;

    const startFading = () => {
      if (fadeStarted) return;
      fadeStarted = true;

      if (isLiveModeRef.current) {
        initWebAudio();
        playLiveCheer(true);
      }

      setCurrentSong(song);
      setIsPlaying(true);
      setProgress(0);
      setCurrentTime(0);
      activeDeckRef.current = nextDeck; // 即座にUI更新先を切り替え

      incrementPlayCount(song);

      const DURATION_MS = 1000; // 手動スキップ時はキビキビとした1.0秒フェード
      const STEPS = 20; // 50msごとに更新
      const stepInterval = DURATION_MS / STEPS;
      // バックグラウンド時はタイマー間引きでフェードが終わらず無音になるため即時切り替え
      const isBackground = typeof document !== "undefined" && document.hidden;
      const fadeStartTime = Date.now();

      const fadeTick = () => {
        const ratio = isBackground ? 1 : Math.min(1, (Date.now() - fadeStartTime) / DURATION_MS);

        const outVolume = Math.max(0, Math.cos(ratio * 0.5 * Math.PI));
        const inVolume = Math.min(1, Math.sin(ratio * 0.5 * Math.PI));

        if (currentAudio) {
          try { currentAudio.volume = outVolume; } catch {}
        }
        if (nextAudio) {
          try { nextAudio.volume = inVolume; } catch {}
        }

        if (ratio >= 1) {
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

          // クロスフェード完了後、次の曲をプリロード＆キャッシュ
          setTimeout(async () => {
            if (isRandomRef.current) {
              const next = pickNextRandomSong();
              if (next) {
                nextSongRef.current = next;
                preloadAudioToCache(next.file_url);
                const preloadUrl = await getCachedAudioUrl(next.file_url);
                if (currentAudio) {
                  currentAudio.src = preloadUrl;
                  currentAudio.load();
                }
              }
            }
          }, 1500);
        }
      };
      fadeIntervalRef.current = setInterval(fadeTick, stepInterval);
      if (isBackground) fadeTick();
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
  }, [pickNextRandomSong, initWebAudio, playLiveCheer]);

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
      if (cheerAudioRef.current) {
        fadeOutAudio(cheerAudioRef.current, 500);
      }
    } else {
      activeAudio.play().catch((e) => console.warn("Toggle play failed:", e));
      setIsPlaying(true);
      if (isLiveModeRef.current) {
        initWebAudio();
        playLiveCheer(true);
      }
    }
  }, [currentSong, isPlaying, initWebAudio, playLiveCheer, fadeOutAudio]);

  // ランダム再生モードのトグル
  const toggleRandom = useCallback(() => {
    setIsRandom((prev) => !prev);
  }, []);

  // ランダム再生モードの明示的セット
  const setRandomExplicit = useCallback((val: boolean) => {
    setIsRandom(val);
    isRandomRef.current = val;
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

  // タイムスタンプ指定ジャンプ（リリック同期用）
  const seekTo = useCallback((targetSeconds: number) => {
    const activeAudio = activeDeckRef.current === "A" ? audioRefA.current : audioRefB.current;
    if (!activeAudio || isNaN(targetSeconds)) return;
    const boundedTime = Math.max(0, Math.min(targetSeconds, activeAudio.duration || targetSeconds));
    activeAudio.currentTime = boundedTime;
    setCurrentTime(boundedTime);
    if (activeAudio.duration) {
      setProgress((boundedTime / activeAudio.duration) * 100);
    }
  }, []);

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
            // ※バックグラウンド中はタイマー間引きでクロスフェードが破綻するため行わず、曲終了時に切り替える
            if (isRandomRef.current && !isFadingRef.current && !(typeof document !== "undefined" && document.hidden)) {
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
          },
        ],
      });

      const safeSetHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch {}
      };

      // 再生 / 一時停止は「現在の実際の状態」を見て冪等に動作させる（ロック画面操作のズレ防止）
      safeSetHandler("play", () => {
        const ctx = audioContextRef.current;
        if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
        if (!isPlayingRef.current) togglePlay();
      });
      safeSetHandler("pause", () => {
        if (isPlayingRef.current) togglePlay();
      });
      safeSetHandler("nexttrack", () => playNextSong());
      safeSetHandler("previoustrack", () => playPrevSong());
      safeSetHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") seekTo(details.seekTime);
      });
    }
  }, [currentSong, togglePlay, playNextSong, playPrevSong, seekTo]);

  // ロック画面・通知の再生状態と再生位置を同期
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = currentSong ? (isPlaying ? "playing" : "paused") : "none";
      if (currentSong && duration > 0 && isFinite(duration)) {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(Math.max(0, currentTime), duration),
        });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentSong, duration]);

  // バックグラウンド再生の安定化
  // - iOS Safari: オーディオセッションを「再生」扱いにして画面ロック・バックグラウンドでも継続
  // - Web Audio(AudioContext)が中断/サスペンドされたら自動で復帰
  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      const audioSession = (navigator as any).audioSession;
      if (audioSession) audioSession.type = "playback";
    } catch {}

    const handleVisibility = () => {
      const ctx = audioContextRef.current;
      if (ctx && ctx.state !== "running" && isPlayingRef.current) {
        ctx.resume().catch(() => {});
      }
      if (!document.hidden) {
        // フォアグラウンド復帰時：UIの再生状態を実際のオーディオ要素に同期
        const audio = activeDeckRef.current === "A" ? audioRefA.current : audioRefB.current;
        if (audio && audio.src) {
          setIsPlaying(!audio.paused);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const displayProgress = isDragging ? dragProgress : progress;

  // 60fps/120fpsアニメーション同期用：ミリ秒単位の真の現在再生時刻を即時返却
  const getExactTime = useCallback(() => {
    const audio = activeDeckRef.current === "A" ? audioRefA.current : audioRefB.current;
    return audio ? (audio.currentTime || 0) : 0;
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        isRandom,
        isCrossfading,
        isLiveMode,
        toggleLiveMode,
        triggerCheer,
        currentCheerToast,
        currentTime,
        duration,
        supporterRankInfo,
        refreshSupporterRank,
        playSong,
        seekTo,
        togglePlay,
        toggleRandom,
        setIsRandom: setRandomExplicit,
        playNextSong,
        playPrevSong,
        startRandomPlay,
        setPlaylist,
        getExactTime,
      }}
    >
      {children}

      {/* Dual Deck Audio Elements */}
      <audio ref={audioRefA} crossOrigin="anonymous" playsInline preload="auto" />
      <audio ref={audioRefB} crossOrigin="anonymous" playsInline preload="auto" />

      {/* グローバルプレイヤー（画面下部固定：/live ページでは専用UIがあるため非表示） */}
      {currentSong && pathname !== "/live" && (
        <div className={`fixed bottom-0 left-0 w-full backdrop-blur-2xl border-t transition-all duration-300 z-[80] ${
          isLiveMode
            ? "bg-slate-950/95 border-rose-500/30 shadow-[0_-10px_40px_rgba(225,29,72,0.15)] text-white"
            : "bg-white/95 border-slate-200/90 shadow-[0_-10px_35px_rgba(0,0,0,0.08)] text-slate-900"
        }`}>
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
            <div className={`w-full h-1.5 sm:h-2 group-hover:h-2.5 transition-all relative overflow-visible ${
              isLiveMode ? "bg-slate-800/80" : "bg-slate-200/80"
            }`}>
              {/* 再生済みバー */}
              <div
                className={`h-full relative ${
                  isCrossfading
                    ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse"
                    : isLiveMode
                    ? "bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 shadow-[0_0_12px_rgba(244,63,94,0.7)]"
                    : "bg-indigo-600 group-hover:bg-indigo-500"
                }`}
                style={{ width: `${displayProgress}%` }}
              >
                {/* つまみ（ハンドル） */}
                <div
                  className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full bg-white border-2 shadow-md transition-all ${
                    isLiveMode ? "border-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.9)]" : "border-indigo-600"
                  } ${
                    isDragging ? "w-4 h-4 scale-125" : "w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-90 group-hover:opacity-100 group-hover:scale-110"
                  }`}
                />
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-3.5 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-6">
            {/* 楽曲メタ情報＆いいね・コメント（左側） */}
            <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
              {/* カバーアート（クリックで曲詳細へ） */}
              <Link
                href={`/song/${currentSong.id}`}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl overflow-hidden shrink-0 shadow-sm border relative group block active:scale-95 transition-transform ${
                  isLiveMode ? "border-rose-500/40 bg-slate-900 shadow-rose-950/40" : "border-slate-200 bg-slate-100"
                }`}
                title="曲詳細・歌詞を見る"
              >
                {currentSong.cover_url ? (
                  <img src={currentSong.cover_url} alt="Cover" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white font-bold text-xs">
                    AMU
                  </div>
                )}
                {isPlaying && (
                  <div className={`absolute inset-0 flex items-center justify-center ${isLiveMode ? "bg-rose-950/40" : "bg-black/20"}`}>
                    <span className={`w-2.5 h-2.5 rounded-full animate-ping ${isLiveMode ? "bg-rose-400" : "bg-white"}`}></span>
                  </div>
                )}
              </Link>

              <div className="truncate min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    href={`/song/${currentSong.id}`}
                    className={`font-extrabold transition-colors truncate text-xs sm:text-base leading-snug ${
                      isLiveMode ? "text-white hover:text-rose-300" : "text-slate-900 hover:text-indigo-600"
                    }`}
                    title="曲詳細・歌詞を見る"
                  >
                    {currentSong.title}
                  </Link>

                  {/* リリモ対応バッジ */}
                  {currentSong.synced_lyrics && (
                    <Link
                      href={`/song/${currentSong.id}`}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow-2xs hover:opacity-90 transition-opacity shrink-0 tracking-wider"
                      title="リリモ文字PV対応楽曲"
                    >
                      <span>🎬</span>
                      <span>Lyrimo</span>
                    </Link>
                  )}

                  {isCrossfading && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black bg-gradient-to-r from-indigo-600 to-pink-600 text-white animate-pulse">
                      <span>✨</span>
                      <span>Crossfade</span>
                    </span>
                  )}
                </div>

                <div className={`flex items-center gap-3 text-xs font-medium truncate mt-0.5 ${
                  isLiveMode ? "text-slate-400" : "text-slate-500"
                }`}>
                  <span className="truncate">{currentSong.artist}</span>

                  {/* いいね＆コメントアクションボタン群 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* いいねボタン（サポーターランク色に対応） */}
                    <button
                      type="button"
                      onClick={toggleCurrentLike}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold transition-all active:scale-95 cursor-pointer border ${
                        currentLikes.isLiked
                          ? supporterRankInfo.rank === "platinum"
                            ? "bg-cyan-50 border-cyan-300 text-cyan-600 shadow-2xs"
                            : supporterRankInfo.rank === "gold"
                            ? "bg-amber-50 border-amber-300 text-amber-600 shadow-2xs"
                            : supporterRankInfo.rank === "silver"
                            ? "bg-slate-100 border-slate-300 text-slate-600"
                            : supporterRankInfo.rank === "bronze"
                            ? "bg-amber-950/10 border-[#CD7F32]/50 text-[#8a4a16]"
                            : "bg-rose-50 border-rose-200 text-rose-600"
                          : isLiveMode
                          ? "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800"
                      }`}
                      title={currentLikes.isLiked ? "いいねを取り消す" : "いいね！"}
                    >
                      <svg
                        className={`w-3.5 h-3.5 ${
                          currentLikes.isLiked
                            ? supporterRankInfo.heartColor
                            : "fill-none stroke-current"
                        }`}
                        style={
                          currentLikes.isLiked && supporterRankInfo.heartHex
                            ? { color: supporterRankInfo.heartHex, fill: supporterRankInfo.heartHex }
                            : undefined
                        }
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      <span>{currentLikes.count}</span>
                    </button>

                    {/* コメントボタン */}
                    <Link
                      href={`/song/${currentSong.id}#comments`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all active:scale-95 cursor-pointer ${
                        isLiveMode
                          ? "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800"
                      }`}
                      title="コメントを見る・投稿する"
                    >
                      <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>{currentCommentsCount}</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* 再生コントロール（LIVE・シャッフル・前・再生・次・時間） */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {/* 時間表示 */}
              {duration > 0 && (
                <span className={`text-[11px] font-mono shrink-0 hidden md:inline select-none ${
                  isLiveMode ? "text-slate-400" : "text-slate-400"
                }`}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              )}

              {/* LIVE音響（大ホール空間）トグル：操作系と調和するシンプルな丸型ボタン */}
              <button
                type="button"
                onClick={toggleLiveMode}
                title={isLiveMode ? "LIVE音響（大ホール）をOFFにする" : "LIVE音響（大ホール空間）をONにする"}
                className={`p-2 sm:p-2.5 rounded-full transition-all active:scale-95 cursor-pointer relative select-none ${
                  isLiveMode
                    ? "bg-rose-600 text-white shadow-md shadow-rose-500/30 ring-2 ring-rose-400/50"
                    : isLiveMode
                    ? "text-slate-400 hover:text-white hover:bg-slate-900"
                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="text-xs sm:text-sm leading-none">🏟️</span>
                {isLiveMode && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white ring-2 ring-rose-500 animate-pulse"></span>
                )}
              </button>

              {/* シャッフル / ランダム再生トグルボタン */}
              <button
                type="button"
                onClick={toggleRandom}
                title={isRandom ? "ランダム自動再生中 (ON)" : "ランダム再生をONにする"}
                className={`p-2 sm:p-2.5 rounded-full transition-all active:scale-95 cursor-pointer relative ${
                  isRandom
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : isLiveMode
                    ? "text-slate-400 hover:text-white hover:bg-slate-900"
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
                className={`hidden sm:flex p-2 rounded-full active:scale-95 transition-all cursor-pointer ${
                  isLiveMode ? "text-slate-400 hover:text-white hover:bg-slate-900" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                }`}
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
                className={`w-11 h-11 sm:w-13 sm:h-13 flex items-center justify-center rounded-full active:scale-95 transition-all shadow-md cursor-pointer ${
                  isLiveMode
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 ring-2 ring-rose-400/40"
                    : "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20"
                }`}
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
                className={`p-2 sm:p-2.5 rounded-full active:scale-95 transition-all cursor-pointer ${
                  isLiveMode ? "text-slate-300 hover:text-white hover:bg-slate-900" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>

              {/* 歌詞・曲詳細ボタン（右端） */}
              <Link
                href={`/song/${currentSong.id}`}
                className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ml-1 ${
                  isLiveMode
                    ? "bg-slate-900 hover:bg-rose-950 hover:text-rose-300 text-slate-300 border border-slate-800"
                    : "bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700"
                }`}
                title="曲詳細・リリモ文字PVを見る"
              >
                <span>歌詞・リリモ</span>
                <span>↗</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </AudioPlayerContext.Provider>
  );
}
