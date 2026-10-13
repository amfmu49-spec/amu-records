"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAudioPlayer, LIVE_CHEERS } from "@/components/AudioPlayerProvider";
import { createClient } from "@/utils/supabase/client";
import { toCdnUrl } from "@/utils/cdn";

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  rotation: number;
  vRot: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

const SLOT_COUNT = 40;

// 曲ごとの自然な初期盛り上がり波形（サビ付近が盛り上がるシード生成）
function generateInitialTimeline(songId: string): number[] {
  let seed = 0;
  for (let i = 0; i < songId.length; i++) {
    seed = (seed * 31 + songId.charCodeAt(i)) & 0xffffff;
  }
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const progress = i / (SLOT_COUNT - 1);
    const chorusPeak = Math.exp(-Math.pow((progress - 0.65) / 0.16, 2)) * 7;
    const bridgePeak = Math.exp(-Math.pow((progress - 0.35) / 0.12, 2)) * 3.5;
    const introWave = Math.sin(progress * Math.PI * 2) * 1.5;
    const variance = ((seed + i * 19) % 7) * 0.4;
    return Math.max(1, Math.round(2 + chorusPeak + bridgePeak + introWave + variance));
  });
}

// Catmull-Rom スプライン補間による滑らかな折れ線・エリアパス生成
function generateWavePaths(data: number[], width = 400, height = 44) {
  if (!data || data.length === 0) return { linePath: "", areaPath: "", peakIndex: 0, points: [] };
  const maxVal = Math.max(...data, 10);
  const paddingBottom = 4;
  const paddingTop = 6;
  const availableH = height - paddingTop - paddingBottom;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const ratio = Math.min(1, val / maxVal);
    const y = height - paddingBottom - ratio * availableH;
    return { x, y };
  });

  let peakIndex = 0;
  let maxV = -1;
  data.forEach((v, i) => {
    if (v > maxV) {
      maxV = v;
      peakIndex = i;
    }
  });

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  const linePath = d;
  const areaPath = `${d} L ${width} ${height} L 0 ${height} Z`;

  return { linePath, areaPath, peakIndex, points };
}

export default function LiveStagePage() {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    seekTo,
    togglePlay,
    playNextSong,
    playPrevSong,
    playSong,
    isRandom,
    toggleRandom,
    setIsRandom,
    startRandomPlay,
    setPlaylist,
    isLiveMode,
    toggleLiveMode,
    triggerCheer,
    currentCheerToast,
  } = useAudioPlayer();

  // ブースト＆コンボ状態
  const [totalBoosts, setTotalBoosts] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [isScreenShaking, setIsScreenShaking] = useState(false);
  const [isStageFlashing, setIsStageFlashing] = useState(false);

  // タイムライン（折れ線グラフ／ヒートマップ）状態
  const [timelineData, setTimelineData] = useState<number[]>([]);
  const lastPlayedSongIdRef = useRef<string | null>(null);

  // 選曲ドロワー／モーダル
  const [isSongPickerOpen, setIsSongPickerOpen] = useState(false);
  const [availableSongs, setAvailableSongs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // コンボタイマーRef
  const comboTimerRef = useRef<any>(null);

  // パーティクル＆エフェクト
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const particleIdRef = useRef(0);
  const textIdRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 初回ロード：LIVEモード強制ON ＆ デフォルトランダム再生ON
  useEffect(() => {
    // LIVEページに入った時点でLIVEモードがOFFなら自動でONにする
    if (!isLiveMode) {
      toggleLiveMode();
    }

    // LIVEモードはデフォルトでランダム再生
    if (!isRandom) {
      setIsRandom(true);
    }
  }, [isLiveMode, toggleLiveMode, isRandom, setIsRandom]);

  // 再生中の曲が変わるたびに、その曲固有のトータルブースト数＆タイムラインを復元 ＆ 歓声で盛り上げる！
  useEffect(() => {
    if (!currentSong?.id) return;

    // トータルブースト数の復元
    try {
      const saved = localStorage.getItem(`amu_live_song_boosts_${currentSong.id}`);
      setTotalBoosts(saved ? parseInt(saved, 10) || 0 : 0);
    } catch {
      setTotalBoosts(0);
    }

    // タイムラインヒートマップの復元
    try {
      const savedTl = localStorage.getItem(`amu_live_song_timeline_${currentSong.id}`);
      if (savedTl) {
        setTimelineData(JSON.parse(savedTl));
      } else {
        setTimelineData(generateInitialTimeline(currentSong.id));
      }
    } catch {
      setTimelineData(generateInitialTimeline(currentSong.id));
    }

    // 楽曲が始まったら歓声で会場が沸き立ちフェードアウト！
    if (lastPlayedSongIdRef.current !== currentSong.id) {
      lastPlayedSongIdRef.current = currentSong.id;
      if (isLiveMode) {
        triggerCheer();
      }
    }
  }, [currentSong?.id, isLiveMode, triggerCheer]);

  // 利用可能な楽曲一覧をロード＆デフォルトランダム選曲で再生開始
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("songs")
      .select("*, profiles:profiles!fk_user_profile(*)")
      .order("play_count", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAvailableSongs(data);
          // まだ曲が再生されていない場合、全曲からランダムに選曲して再生開始！
          if (!currentSong) {
            startRandomPlay(data);
          } else {
            // すでに再生中の場合もLIVE用プレイリストを設定しランダムをON
            setPlaylist(data);
            setIsRandom(true);
          }
        }
      });
  }, [currentSong, startRandomPlay, setPlaylist, setIsRandom]);

  // コンボリセットの監視（1.8秒放置でコンボ終了）
  const resetComboTimer = useCallback(() => {
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => {
      setCombo(0);
    }, 1800);
  }, []);

  // 画面タップ・連打時のブースト処理
  const handleBoost = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    // 1. カウントアップ＆コンボ更新
    setTotalBoosts((prev) => {
      const next = prev + 1;
      if (currentSong?.id) {
        try {
          localStorage.setItem(`amu_live_song_boosts_${currentSong.id}`, String(next));
        } catch {}
      }
      return next;
    });

    // タイムラインヒートマップ（折れ線グラフ波形）をリアルタイムに加算！
    if (currentSong?.id && duration > 0) {
      const progressRatio = Math.min(1, Math.max(0, currentTime / duration));
      const slotIdx = Math.min(SLOT_COUNT - 1, Math.max(0, Math.floor(progressRatio * SLOT_COUNT)));

      setTimelineData((prev) => {
        const next = prev.length === SLOT_COUNT ? [...prev] : generateInitialTimeline(currentSong.id);
        next[slotIdx] = (next[slotIdx] || 0) + 1;
        // 隣接スロットにも熱気（山）を少し伝播して滑らかな山にする
        if (slotIdx > 0) next[slotIdx - 1] = (next[slotIdx - 1] || 0) + 0.35;
        if (slotIdx < SLOT_COUNT - 1) next[slotIdx + 1] = (next[slotIdx + 1] || 0) + 0.35;
        try {
          localStorage.setItem(`amu_live_song_timeline_${currentSong.id}`, JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    const newCombo = combo + 1;
    setCombo(newCombo);
    if (newCombo > maxCombo) setMaxCombo(newCombo);
    resetComboTimer();

    // 2. 画面シェイク＆ステージフラッシュ
    setIsScreenShaking(true);
    setIsStageFlashing(true);
    setTimeout(() => setIsScreenShaking(false), 200);
    setTimeout(() => setIsStageFlashing(false), 120);

    // 3. クリック／タップ座標の取得
    let clientX = window.innerWidth / 2;
    let clientY = window.innerHeight / 2;
    if ("clientX" in e && typeof e.clientX === "number" && e.clientX > 0) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else if ("touches" in e && (e as any).touches && (e as any).touches.length > 0) {
      clientX = (e as any).touches[0].clientX;
      clientY = (e as any).touches[0].clientY;
    }

    // 4. フローティングテキストの追加
    const textId = ++textIdRef.current;
    const boostTexts = ["+1 BOOST!", "🔥 ROCK!", "⚡ FEVER!", "💖 LOVE!", "🚀 HYPER!", "✨ YEAH!"];
    const chosenText = boostTexts[Math.floor(Math.random() * boostTexts.length)];
    const textColors = ["#f43f5e", "#fbbf24", "#38bdf8", "#a855f7", "#ec4899", "#22c55e"];
    const chosenColor = textColors[Math.floor(Math.random() * textColors.length)];

    setFloatingTexts((prev) => [
      ...prev.slice(-10),
      {
        id: textId,
        x: clientX + (Math.random() * 60 - 30),
        y: clientY - 30,
        text: newCombo % 5 === 0 ? `COMBO x${newCombo}!!` : chosenText,
        color: chosenColor,
      },
    ]);

    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((t) => t.id !== textId));
    }, 1000);

    // 5. パーティクルの生成（15〜25個の光の火花）
    const count = 18;
    const newParticles: Particle[] = [];
    const colors = ["#ff0055", "#ffaa00", "#00ffff", "#ff00ff", "#ffffff", "#ffe600"];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = Math.random() * 12 + 6;
      newParticles.push({
        id: ++particleIdRef.current,
        x: clientX,
        y: clientY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 3,
        alpha: 1,
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 15,
      });
    }

    setParticles((prev) => [...prev.slice(-40), ...newParticles]);
  };

  // パーティクルのアニメーションループ (Canvas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      setParticles((prev) => {
        if (prev.length === 0) return prev;
        const updated: Particle[] = [];

        for (const p of prev) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.25; // 重力
          p.vx *= 0.96; // 摩擦
          p.alpha -= 0.025; // フェード
          p.rotation += p.vRot;

          if (p.alpha > 0.05) {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;

            // 星型または円
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            updated.push(p);
          }
        }
        return updated;
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // コンボランクに応じた称号とカラー
  const getComboBadge = (c: number) => {
    if (c >= 40) return { title: "👑 LEGENDARY STAGE", color: "from-amber-400 via-pink-500 to-purple-600" };
    if (c >= 25) return { title: "💥 ULTRA EXPLOSION", color: "from-purple-500 via-rose-500 to-amber-400" };
    if (c >= 15) return { title: "🚀 SUPER FEVER", color: "from-rose-500 via-red-500 to-pink-500" };
    if (c >= 8) return { title: "⚡ GREAT BOOST", color: "from-amber-400 to-rose-500" };
    if (c >= 3) return { title: "🔥 NICE BOOST", color: "from-indigo-400 to-rose-400" };
    return null;
  };

  const comboBadge = getComboBadge(combo);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const filteredSongs = availableSongs.filter((s) =>
    (s.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.artist || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 折れ線グラフ（SVG波形）のパス計算
  const waveData = generateWavePaths(timelineData, 400, 44);
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  // シークバータップ／クリック時のジャンプ処理
  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX =
      "touches" in e && (e as any).touches && (e as any).touches.length > 0
        ? (e as any).touches[0].clientX
        : (e as React.MouseEvent).clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (duration > 0) {
      seekTo(ratio * duration);
    }
  };

  return (
    <div
      onPointerDown={handleBoost}
      className={`relative w-full min-h-[100dvh] h-[100dvh] overflow-hidden bg-black select-none text-white flex flex-col justify-between cursor-pointer ${
        isScreenShaking ? "animate-[wiggle_0.2s_ease-in-out]" : ""
      }`}
    >
      {/* 1. 客席後方から見たライブステージ背景画像 */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-700 pointer-events-none scale-105"
        style={{ backgroundImage: "url('/images/live_stage_bg.jpg')" }}
      />

      {/* 2. ステージフラッシュオーバーレイ */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${
          isStageFlashing ? "opacity-35" : "opacity-0"
        }`}
      />

      {/* 3. 暗幕グラデーション（UIの視認性確保とコントラスト向上） */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/70 pointer-events-none" />

      {/* 4. アニメーションするダイナミックステージライト＆レーザー */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60">
        <div className="absolute top-0 left-1/4 w-96 h-[80vh] bg-gradient-to-b from-cyan-500/20 via-pink-500/10 to-transparent blur-3xl transform -rotate-12 animate-pulse" />
        <div className="absolute top-0 right-1/4 w-96 h-[80vh] bg-gradient-to-b from-purple-500/20 via-rose-500/10 to-transparent blur-3xl transform rotate-12 animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      {/* 5. パーティクル用 Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-20" />

      {/* ────────── [上部セクション] ヘッダー ＆ LEDスクリーン ────────── */}
      <div className="relative z-30 w-full shrink-0 flex flex-col items-center pointer-events-none">
        {/* 6. 上部ヘッダーコントロール */}
        <header
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center justify-between p-3 sm:p-5 max-w-7xl mx-auto w-full pointer-events-auto"
        >
          {/* 通常画面へ戻る */}
          <Link
            href="/"
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-xs sm:text-sm font-bold text-white transition-all active:scale-95 shadow-lg group cursor-pointer"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            <span>通常へ戻る</span>
          </Link>

          {/* ライブステージ情報バッジ */}
          <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-rose-500/40 shadow-lg shadow-rose-950/50">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="text-[11px] sm:text-sm font-black tracking-widest bg-gradient-to-r from-red-400 via-rose-300 to-amber-300 bg-clip-text text-transparent uppercase">
              LIVE ARENA HALL
            </span>
            <span className="text-xs hidden sm:inline">🏟️</span>
          </div>

          {/* 選曲ボタン */}
          <button
            type="button"
            onClick={() => setIsSongPickerOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-rose-600/80 hover:bg-rose-600 backdrop-blur-md border border-rose-400/50 text-xs sm:text-sm font-black text-white transition-all active:scale-95 shadow-lg shadow-rose-600/30 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
            </svg>
            <span>選曲する</span>
          </button>
        </header>

        {/* 7. ステージLEDスクリーン（現在演奏中の楽曲プロジェクション） */}
        <div className="flex flex-col items-center justify-center px-4 text-center max-w-xl mx-auto pb-1">
          {currentSong ? (
            <div className="flex flex-col items-center">
              {/* スクリーン風カバーアート */}
              <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-[0_0_35px_rgba(244,63,94,0.35)] border-2 border-rose-500/50 relative mb-1.5 group">
                {currentSong.cover_url ? (
                  <img src={currentSong.cover_url} alt="Cover" className="w-full h-full object-cover animate-[pulse_4s_ease-in-out_infinite]" />
                ) : (
                  <div className="w-full h-full bg-slate-900 flex items-center justify-center text-rose-400 font-black text-sm sm:text-base">
                    LIVE
                  </div>
                )}
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <div className="flex items-end gap-1 h-4">
                      <span className="w-1 bg-rose-400 animate-[bounce_0.8s_infinite] h-full rounded-full" />
                      <span className="w-1 bg-rose-400 animate-[bounce_0.6s_infinite] h-3 rounded-full" />
                      <span className="w-1 bg-rose-400 animate-[bounce_1.0s_infinite] h-full rounded-full" />
                    </div>
                  </div>
                )}
              </div>

              {/* 楽曲タイトル */}
              <h1 className="text-base sm:text-xl font-black text-white drop-shadow-[0_2px_15px_rgba(0,0,0,0.9)] tracking-tight line-clamp-1">
                {currentSong.title}
              </h1>
              {/* アーティスト名 */}
              <p className="text-[11px] sm:text-xs text-rose-200/90 font-bold drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] line-clamp-1">
                {currentSong.artist}
              </p>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-xs text-slate-300 font-bold">右上の「選曲する」から曲を選んでライブを開始！</p>
            </div>
          )}
        </div>
      </div>

      {/* ────────── [中央セクション] 画面タップ連打ライブ空間 ＆ コンボ ＆ おしゃれなBOOST HUD ────────── */}
      <div className="relative z-30 flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto px-4 my-auto min-h-0 pointer-events-none">
        {/* 歓声トースト演出（日本人オーディエンスの歓声が発生した時） */}
        {currentCheerToast && (
          <div className="mb-2 px-3.5 py-1 rounded-full bg-slate-900/95 border border-rose-500/60 shadow-xl backdrop-blur-md animate-bounce text-[11px] sm:text-xs font-bold text-rose-300 flex items-center gap-1.5">
            <span>👏</span>
            <span>{currentCheerToast.name}！</span>
          </div>
        )}

        {/* コンボインジケーター（画面どこでも連打すると出現！） */}
        {combo > 0 && (
          <div className="mb-3 flex flex-col items-center animate-[bounce_0.4s_ease-out]">
            {comboBadge && (
              <span
                className={`text-[10px] sm:text-xs font-black px-3.5 py-0.5 rounded-full bg-gradient-to-r ${comboBadge.color} text-white shadow-lg shadow-rose-500/40 uppercase tracking-widest mb-1 animate-pulse`}
              >
                {comboBadge.title}
              </span>
            )}
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-5xl font-black font-mono tracking-tight bg-gradient-to-r from-amber-300 via-rose-300 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(244,63,94,0.9)]">
                {combo}
              </span>
              <span className="text-sm sm:text-lg font-black text-white tracking-widest drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                COMBO!
              </span>
            </div>
          </div>
        )}

        {/* ★ この曲の総ブースト数：超おしゃれなネオンHUDスタイル */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="relative group flex items-center gap-3.5 px-5 sm:px-6 py-2.5 rounded-2xl bg-black/75 border border-rose-500/40 backdrop-blur-xl shadow-[0_0_35px_rgba(244,63,94,0.3)] pointer-events-auto transition-transform active:scale-95"
        >
          {/* ネオンパルスライト */}
          <div className="relative flex items-center justify-center">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping opacity-75 absolute" />
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-amber-400 to-rose-500 shadow-md shadow-rose-500" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono font-black tracking-[0.22em] text-rose-300/80 uppercase">
                STAGE HEAT ENERGY
              </span>
              <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                LIVE
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight bg-gradient-to-r from-amber-200 via-rose-300 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(244,63,94,0.7)]">
                {totalBoosts.toLocaleString()}
              </span>
              <span className="text-[10px] font-black tracking-widest text-amber-300 font-mono">
                BOOSTS
              </span>
            </div>
          </div>

          {/* セパレーター */}
          <div className="h-7 w-px bg-gradient-to-b from-transparent via-rose-500/40 to-transparent mx-0.5" />

          {/* 連打アイコン */}
          <div className="flex flex-col items-center">
            <span className="text-lg filter drop-shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse">
              🔥
            </span>
          </div>
        </div>

        {/* 画面連打ガイドヒント */}
        <div className="mt-3.5 text-[11px] sm:text-xs font-bold text-white/50 tracking-wider flex items-center gap-1.5 animate-pulse pointer-events-none select-none">
          <span>👆</span>
          <span>画面のどこでも連打してライブを盛り上げよう！</span>
        </div>
      </div>

      {/* ────────── [下部セクション] シークバー折れ線グラフ ＆ 完全中央コントロール ────────── */}
      <footer
        onPointerDown={(e) => e.stopPropagation()}
        className="relative z-30 w-full shrink-0 pt-2 pb-6 sm:pb-5 pb-[max(1.8rem,calc(env(safe-area-inset-bottom)+0.8rem))] bg-gradient-to-t from-black via-black/95 to-transparent flex flex-col items-center pointer-events-auto"
      >
        {/* ─── 1. 折れ線グラフ一体型シークバー（BOOST数連動ヒートマップ） ─── */}
        <div className="w-full max-w-xl px-4 sm:px-6 mb-2.5 flex flex-col">
          {/* 折れ線グラフSVGコンテナ */}
          <div
            onClick={handleSeek}
            className="relative w-full h-11 sm:h-12 bg-slate-950/70 hover:bg-slate-900/80 rounded-xl border border-rose-500/40 backdrop-blur-md overflow-hidden cursor-pointer group shadow-[0_0_25px_rgba(244,63,94,0.2)] transition-all"
            title="クリックして該当時間へスキップ"
          >
            {/* SVG折れ線グラフ波形 */}
            <svg
              viewBox="0 0 400 44"
              preserveAspectRatio="none"
              className="w-full h-full block"
            >
              <defs>
                {/* エリアチャート用グラデーション（上部ネオンピンク、下部透明） */}
                <linearGradient id="liveHeatGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.75" />
                  <stop offset="50%" stopColor="#ec4899" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#881337" stopOpacity="0.02" />
                </linearGradient>

                {/* 未再生部分用グラデーション */}
                <linearGradient id="liveHeatUnplayedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#64748b" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#1e293b" stopOpacity="0.05" />
                </linearGradient>

                {/* 折れ線ストローク用グラデーション */}
                <linearGradient id="liveLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#fb7185" />
                  <stop offset="50%" stopColor="#f43f5e" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>

                {/* 再生済み領域クリップパス */}
                <clipPath id="playedClip">
                  <rect x="0" y="0" width={`${progressRatio * 400}`} height="44" />
                </clipPath>
              </defs>

              {/* 背景：未再生エリア */}
              {waveData.areaPath && (
                <path
                  d={waveData.areaPath}
                  fill="url(#liveHeatUnplayedGrad)"
                />
              )}

              {/* 前景：再生済みエリア（クリップされて鮮やかに発光） */}
              {waveData.areaPath && (
                <path
                  d={waveData.areaPath}
                  fill="url(#liveHeatGrad)"
                  clipPath="url(#playedClip)"
                />
              )}

              {/* 折れ線ストローク */}
              {waveData.linePath && (
                <path
                  d={waveData.linePath}
                  fill="none"
                  stroke="url(#liveLineGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="filter drop-shadow-[0_0_5px_rgba(244,63,94,0.9)]"
                />
              )}
            </svg>

            {/* 最大盛り上がり地点（PEAK）マーカー */}
            {waveData.points && waveData.points[waveData.peakIndex] && (
              <div
                className="absolute pointer-events-none transform -translate-x-1/2 flex flex-col items-center z-10"
                style={{
                  left: `${(waveData.peakIndex / (SLOT_COUNT - 1)) * 100}%`,
                  top: "2px",
                }}
              >
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/90 text-[8px] font-black text-black tracking-tighter uppercase shadow-md flex items-center gap-0.5 animate-pulse">
                  <span>🔥</span>
                  <span>PEAK</span>
                </span>
              </div>
            )}

            {/* 現在の再生位置スキャンライン ＆ 光るThumb */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-20 flex flex-col items-center transition-all duration-75"
              style={{ left: `${progressRatio * 100}%` }}
            >
              {/* スキャン縦線 */}
              <div className="w-0.5 h-full bg-gradient-to-b from-white via-rose-400 to-amber-300 shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
              {/* 光るドット */}
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,1)] transform scale-100 group-hover:scale-125 transition-transform" />
            </div>

            {/* シークバーホバー時のオーバーレイガイド */}
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

          {/* 波形下部のタイムスタンプ ＆ 操作ガイド */}
          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-400 mt-1 px-1">
            <span className="text-rose-300">{formatTime(currentTime)}</span>
            <span className="text-[9px] text-slate-500 tracking-wider">
              📈 BOOSTヒートマップ（タップでジャンプ）
            </span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* ─── 2. 再生コントロールバー（完全な左右数学的センター） ─── */}
        <div className="relative w-full max-w-xl px-4 sm:px-6 flex items-center justify-center">
          {/* 左端：曲時間（PC時のみ表示、絶対配置で中央ボタンに影響を与えない） */}
          <div className="absolute left-4 sm:left-6 hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-400">
            <span className="text-white font-bold">{formatTime(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* 中央：再生コントロール（左右完全均等センタリング） */}
          <div className="flex items-center gap-3.5 sm:gap-5 justify-center">
            {/* 前の曲 */}
            <button
              type="button"
              onClick={playPrevSong}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer"
              title="前の曲"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* 再生/一時停止 */}
            <button
              type="button"
              onClick={togglePlay}
              className="w-13 h-13 rounded-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-rose-600/40 border-2 border-white/40 cursor-pointer"
              title={isPlaying ? "一時停止" : "再生"}
            >
              {isPlaying ? (
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* 次の曲 */}
            <button
              type="button"
              onClick={playNextSong}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer"
              title="次の曲"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* シャッフル / ランダム切り替えボタン */}
            <button
              type="button"
              onClick={toggleRandom}
              className={`p-2.5 rounded-full transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                isRandom
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/40 border border-rose-400"
                  : "bg-white/10 hover:bg-white/20 text-slate-400 border border-transparent"
              }`}
              title={isRandom ? "ランダム再生 ON" : "ランダム再生 OFF"}
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
              </svg>
              <span className="text-[10px] font-black hidden sm:inline">
                {isRandom ? "RANDOM ON" : "RANDOM OFF"}
              </span>
            </button>
          </div>

          {/* 右端：音響ステータスバッジ（PC時のみ表示、絶対配置） */}
          <div className="absolute right-4 sm:right-6 hidden sm:flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400">ACOUSTIC:</span>
            <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/40 text-[10px] font-black text-rose-300">
              HALL REVERB ON
            </span>
          </div>
        </div>
      </footer>

      {/* 9. フローティングテキスト（+1 BOOST! などの飛翔演出） */}
      {floatingTexts.map((item) => (
        <div
          key={item.id}
          className="absolute z-40 font-black text-base sm:text-lg pointer-events-none animate-[floatUp_0.9s_ease-out_forwards]"
          style={{
            left: item.x,
            top: item.y,
            color: item.color,
            textShadow: "0 0 10px rgba(0,0,0,0.9), 0 0 20px " + item.color,
          }}
        >
          {item.text}
        </div>
      ))}

      {/* 11. 選曲モーダル（ドロワー） */}
      {isSongPickerOpen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* モーダルヘッダー */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>🎵</span>
                  <span>ライブで演奏する曲を選択</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">選んだ曲が大ホール音響＆歓声とともに始まります</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSongPickerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 検索ボックス */}
            <div className="p-4 border-b border-slate-800/60 bg-slate-950/40">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="曲名やアーティスト名で検索..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {/* 楽曲一覧リスト */}
            <div className="overflow-y-auto p-3 flex-1 space-y-2">
              {filteredSongs.length > 0 ? (
                filteredSongs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      playSong(
                        {
                          id: s.id,
                          title: s.title,
                          file_url: s.file_url,
                          cover_url: s.cover_url,
                          artist: s.profiles?.artist_name || s.artist || "AMU Artist",
                        },
                        availableSongs
                      );
                      setIsRandom(true);
                      setIsSongPickerOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-2xl flex items-center gap-3 transition-all text-left cursor-pointer ${
                      currentSong?.id === s.id
                        ? "bg-rose-950/80 border border-rose-500/50 shadow-md"
                        : "bg-slate-800/50 hover:bg-slate-800 border border-transparent"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/10">
                      {s.cover_url ? (
                        <img src={toCdnUrl(s.cover_url)} alt="Cover" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
                          AMU
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 truncate">
                      <p className="font-bold text-sm text-white truncate">{s.title}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {s.profiles?.artist_name || s.artist || "AMU Artist"}
                      </p>
                    </div>
                    {currentSong?.id === s.id && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white shrink-0">
                        NOW PLAYING
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-sm text-slate-500">
                  該当する楽曲が見つかりませんでした
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* フローティングテキスト用アニメーションスタイル */}
      <style jsx>{`
        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translate(-50%, 0) scale(0.8);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -40px) scale(1.15);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -80px) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
