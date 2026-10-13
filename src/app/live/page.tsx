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

export default function LiveStagePage() {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
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

  // 再生中の曲が変わるたびに、その曲固有のトータルブースト数を復元
  useEffect(() => {
    if (!currentSong?.id) return;
    try {
      const saved = localStorage.getItem(`amu_live_song_boosts_${currentSong.id}`);
      setTotalBoosts(saved ? parseInt(saved, 10) || 0 : 0);
    } catch {
      setTotalBoosts(0);
    }
  }, [currentSong?.id]);

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

      {/* ────────── [中央セクション] 画面タップ連打ライブ空間 ＆ コンボ ＆ 曲別ブースト ────────── */}
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

        {/* この曲の総ブースト数カウンター ＆ 歓声ボタン */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="flex flex-col items-center gap-2 pointer-events-auto"
        >
          {/* この曲の総ブースト数 */}
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-rose-500/50 backdrop-blur-md shadow-2xl">
            <span className="text-[11px] sm:text-xs text-slate-300 font-bold">この曲のBOOST:</span>
            <span className="text-base sm:text-lg font-black text-amber-300 font-mono tracking-wider">
              {totalBoosts.toLocaleString()}
            </span>
            <span className="text-xs animate-pulse">🔥</span>
          </div>

          {/* 日本人オーディエンス歓声・コール送信ボタン */}
          <button
            type="button"
            onClick={() => triggerCheer()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900/80 hover:bg-rose-950/80 border border-rose-500/50 backdrop-blur-md text-xs font-bold text-rose-300 transition-all active:scale-95 shadow-md shadow-rose-950/50 cursor-pointer"
            title="日本人オーディエンスの歓声・コールを送る"
          >
            <span>👏</span>
            <span>歓声・コールを送る</span>
          </button>
        </div>

        {/* 画面連打ガイドヒント */}
        <div className="mt-4 text-[11px] sm:text-xs font-bold text-white/50 tracking-wider flex items-center gap-1.5 animate-pulse pointer-events-none select-none">
          <span>👆</span>
          <span>画面のどこでもタップ・連打でBOOST！</span>
        </div>
      </div>

      {/* ────────── [下部セクション] プレイヤーコントロールバー（アドレスバー被り解消のため上に引き上げ） ────────── */}
      <footer
        onPointerDown={(e) => e.stopPropagation()}
        className="relative z-30 w-full shrink-0 pt-2 pb-24 sm:pb-8 pb-[max(5rem,calc(env(safe-area-inset-bottom)+3.5rem))] mb-4 sm:mb-0 bg-gradient-to-t from-black via-black/95 to-transparent flex flex-col items-center pointer-events-auto"
      >
        <div className="max-w-4xl w-full flex items-center justify-between gap-4">
          {/* 左側：曲時間表示 */}
          <div className="text-xs font-mono text-slate-400 hidden sm:block">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* 中央：再生・前・次・シャッフルコントロール */}
          <div className="flex items-center gap-3 sm:gap-4 mx-auto">
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

          {/* 右側：音響ステータスバッジ */}
          <div className="hidden sm:flex items-center gap-2">
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
