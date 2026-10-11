"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAudioPlayer } from "@/components/AudioPlayerProvider";
import { parseLrc, findActiveLyricIndex, formatSecondsToTimestamp } from "@/utils/lrcParser";

interface SongLyricsPlayerProps {
  syncedLyrics?: string | null;
  song: {
    id: string;
    title: string;
    file_url: string;
    cover_url?: string | null;
    artist?: string;
  };
}

export default function SongLyricsPlayer({ syncedLyrics, song }: SongLyricsPlayerProps) {
  const { currentSong, isPlaying, currentTime, togglePlay, playSong, seekTo } = useAudioPlayer();
  const [viewMode, setViewMode] = useState<"lyrimo" | "highlight">("lyrimo");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEngineLoaded, setIsEngineLoaded] = useState(false);
  const [isPlanReady, setIsPlanReady] = useState(false);

  // パースしたタイムスタンプ付き歌詞（ハイライト一覧用）
  const lyricLines = useMemo(() => {
    return parseLrc(syncedLyrics);
  }, [syncedLyrics]);

  // この曲が現在プレイヤーで再生されているか
  const isThisSongActive = currentSong?.id === song.id;

  // 現在の再生時間に対応する行のインデックス
  const activeIndex = useMemo(() => {
    if (!isThisSongActive || lyricLines.length === 0) return -1;
    return findActiveLyricIndex(lyricLines, currentTime);
  }, [isThisSongActive, lyricLines, currentTime]);

  const activeListRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Lyrimo エンジン保持用のRef
  const planRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // 1. Lyrimo エンジンスクリプト (/lib/lyrimo.js) の動的読み込み
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).J && (window as any).J.Renderer) {
      setIsEngineLoaded(true);
      return;
    }

    const existingScript = document.querySelector('script[src="/lib/lyrimo.js"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => setIsEngineLoaded(true));
      return;
    }

    const script = document.createElement("script");
    script.src = "/lib/lyrimo.js";
    script.async = true;
    script.onload = () => {
      setIsEngineLoaded(true);
    };
    script.onerror = (e) => {
      console.warn("Failed to load Lyrimo engine:", e);
    };
    document.body.appendChild(script);
  }, []);

  // 2. 「勝手にお任せ」でLyrimoプロジェクト＆カット割りプランを自動生成
  useEffect(() => {
    if (!isEngineLoaded || typeof window === "undefined") return;
    const J = (window as any).J;
    if (!J || !J.plan || !J.Renderer) return;

    try {
      const project = Object.assign(J.defaultProject(), {
        title: song.title || "",
        artist: song.artist || "",
        lyrics: syncedLyrics && syncedLyrics.trim().length > 0 ? syncedLyrics : song.title,
        aspect: "16:9",
        res: 1080,
        fps: 30,
        seed: Math.floor(Math.random() * 9999999), // 開くたびに新鮮なシード
      });

      // ★ ユーザー指示：「お任せボタンもいらない。リリモモードにしたら勝手にお任せで流して」
      // 毎回自動で omakase を実行し、最高にエモいスタイル・配色・動きを自動構成
      if (J.omakase) {
        J.omakase(project);
      }

      const plan = J.plan(project);
      planRef.current = plan;
      rendererRef.current = new J.Renderer();

      // プランに必要なGoogleフォントをバックグラウンドで事前解決
      if (J.ensureFonts) {
        J.ensureFonts(project.lyrics + (project.title || "") + (project.artist || "") + "0123456789", null);
      }

      setIsPlanReady(true);
    } catch (err) {
      console.warn("Failed to build Lyrimo plan:", err);
    }
  }, [isEngineLoaded, song.id, song.title, song.artist, syncedLyrics]);

  // 3. Canvasへの毎フレーム描画ループ（再生時間 currentTime と完全同期）
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const plan = planRef.current;
    const renderer = rendererRef.current;

    if (!canvas || !plan || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // キャンバス表示幅に合わせたスケーリング（高解像度維持）
    const rect = canvas.getBoundingClientRect();
    const displayWidth = Math.max(320, rect.width || 640);
    const targetScale = Math.min(1.0, displayWidth / plan.W);

    const neededW = Math.round(plan.W * targetScale);
    const neededH = Math.round(plan.H * targetScale);

    if (canvas.width !== neededW || canvas.height !== neededH) {
      canvas.width = neededW;
      canvas.height = neededH;
    }

    // 現在の再生時刻を取得（この曲が再生中でなければ 0 秒地点）
    const timeToDraw = isThisSongActive ? currentTime : 0;

    try {
      renderer.frame(ctx, plan, timeToDraw, { scale: targetScale });
    } catch {
      // 描画エラー時はスキップ
    }
  }, [isThisSongActive, currentTime]);

  // 再生中またはシーク時のアニメーションフレーム
  useEffect(() => {
    if (viewMode !== "lyrimo" || !isPlanReady) return;

    renderFrame();

    if (isThisSongActive && isPlaying) {
      const loop = () => {
        renderFrame();
        animFrameIdRef.current = requestAnimationFrame(loop);
      };
      animFrameIdRef.current = requestAnimationFrame(loop);

      return () => {
        if (animFrameIdRef.current) {
          cancelAnimationFrame(animFrameIdRef.current);
          animFrameIdRef.current = null;
        }
      };
    }
  }, [viewMode, isPlanReady, isThisSongActive, isPlaying, renderFrame]);

  // ハイライトモード時の自動スクロール
  useEffect(() => {
    if (viewMode === "highlight" && activeListRef.current) {
      activeListRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex, viewMode]);

  // 行クリックでその位置にシーク
  const handleSeek = (time: number) => {
    if (!isThisSongActive) {
      playSong({
        id: song.id,
        title: song.title,
        file_url: song.file_url,
        cover_url: song.cover_url || null,
        artist: song.artist,
      });
      setTimeout(() => {
        seekTo(time);
      }, 150);
    } else {
      seekTo(time);
    }
  };

  // 再生開始
  const handlePlayThisSong = () => {
    if (isThisSongActive) {
      togglePlay();
    } else {
      playSong({
        id: song.id,
        title: song.title,
        file_url: song.file_url,
        cover_url: song.cover_url || null,
        artist: song.artist,
      });
    }
  };

  // 歌詞がない場合
  if (!syncedLyrics || syncedLyrics.trim().length === 0) {
    return (
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs text-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-xl mx-auto mb-3">
          🎬
        </div>
        <h3 className="text-base font-extrabold text-slate-900 mb-1">
          タイムスタンプ歌詞は未登録です
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          マイページの「曲の編集」から [00:15] 形式でタイムスタンプ付き歌詞を登録すると、ここで文字PVアプリ『Lyrimo（リリモ）』のリアルタイムリリックモーションを楽しめます！
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-[100] bg-slate-950 p-4 sm:p-8 flex flex-col justify-between"
          : "bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-xs"
      }`}
    >
      {/* ヘッダー操作パネル（余計なボタンは置かずシンプルに） */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          {/* モード切り替えタブ */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode("lyrimo")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "lyrimo"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🎬</span>
              <span>Lyrimo モード</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("highlight")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "highlight"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📜</span>
              <span>ハイライト一覧</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* 再生/一時停止トグル */}
          <button
            type="button"
            onClick={handlePlayThisSong}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
              isThisSongActive && isPlaying
                ? "bg-slate-800 hover:bg-slate-700 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            <span>{isThisSongActive && isPlaying ? "⏸ 一時停止" : "▶ 再生"}</span>
          </button>

          {/* 全画面シアター切り替えボタン */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              isFullscreen
                ? "bg-white/20 text-white hover:bg-white/30"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
            title={isFullscreen ? "全画面を閉じる" : "シアター全画面表示"}
          >
            {isFullscreen ? "✕ 縮小" : "⛶ 拡大"}
          </button>
        </div>
      </div>

      {/* ＝＝＝ モード 1: 🔥 Lyrimo（リリモ）本物の文字PV Canvasステージ ＝＝＝ */}
      {viewMode === "lyrimo" && (
        <div
          className={`relative overflow-hidden rounded-2xl flex items-center justify-center select-none bg-black transition-all ${
            isFullscreen
              ? "flex-1 w-full"
              : "w-full aspect-video max-h-[32rem] shadow-2xl border border-slate-800"
          }`}
          onClick={handlePlayThisSong}
        >
          {/* Lyrimo 本物のキャンバス描画ステージ */}
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* 未再生時 / 一時停止時のスマートなオーバーレイ案内 */}
          {(!isThisSongActive || !isPlaying) && (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 transition-opacity cursor-pointer group">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center text-white text-2xl group-hover:scale-110 group-hover:bg-indigo-600 transition-all shadow-xl">
                ▶
              </div>
              <p className="text-xs sm:text-sm font-black text-white/90 tracking-wide drop-shadow-md">
                クリックしてLyrimo文字PVを開始
              </p>
            </div>
          )}

          {/* Lyrimo エンジンバッジ */}
          <div className="absolute top-3.5 left-3.5 z-20 flex items-center gap-2 pointer-events-none">
            <span className="text-[10px] font-mono tracking-widest text-indigo-300 bg-slate-900/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              ⚡ LYRIMO ENGINE
            </span>
          </div>
        </div>
      )}

      {/* ＝＝＝ モード 2: 📜 ハイライト一覧モード ＝＝＝ */}
      {viewMode === "highlight" && (
        <div
          className={`overflow-y-auto rounded-2xl p-3 sm:p-5 transition-all ${
            isFullscreen
              ? "flex-1 bg-slate-900 text-slate-100"
              : "h-80 sm:h-96 md:h-[26rem] bg-slate-50 border border-slate-200/90"
          }`}
        >
          <div className="max-w-2xl mx-auto divide-y divide-slate-200/60 dark:divide-slate-800 space-y-1">
            {lyricLines.map((line, idx) => {
              const isActive = idx === activeIndex;

              return (
                <div
                  key={line.id}
                  ref={isActive ? activeListRef : null}
                  onClick={() => handleSeek(line.time)}
                  className={`group p-3 sm:p-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isActive
                      ? "bg-indigo-600 text-white font-black shadow-md shadow-indigo-600/20 translate-x-1"
                      : isFullscreen
                      ? "text-slate-300 hover:bg-slate-800"
                      : "text-slate-700 hover:bg-white hover:shadow-2xs"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-mono shrink-0 px-2 py-0.5 rounded-md ${
                        isActive
                          ? "bg-white/20 text-white font-bold"
                          : "bg-slate-200/70 text-slate-500"
                      }`}
                    >
                      {formatSecondsToTimestamp(line.time).replace(/[\[\]]/g, "")}
                    </span>
                    <span
                      className={`text-sm sm:text-base leading-relaxed truncate ${
                        isActive ? "font-black scale-102" : "font-semibold"
                      }`}
                    >
                      {line.text}
                    </span>
                  </div>

                  <span
                    className={`text-xs shrink-0 transition-transform ${
                      isActive ? "text-amber-300 font-bold" : "text-slate-400 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    ▶
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* フッター情報 */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span>🎬 楽曲の再生に合わせてLyrimoが自動で文字PVを演出します</span>
        <span>全 {lyricLines.length} フレーズ</span>
      </div>
    </div>
  );
}
