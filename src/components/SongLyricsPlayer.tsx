"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAudioPlayer } from "@/components/AudioPlayerProvider";
import { parseLrc, findActiveLyricIndex } from "@/utils/lrcParser";

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
  const { currentSong, isPlaying, currentTime, togglePlay, playSong, seekTo, getExactTime } = useAudioPlayer();
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
  const scaleRef = useRef<number>(0.5);

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

  // 2. 「勝手にお任せ」でLyrimoプロジェクト＆カット割りプランを自動生成（60fpsフルフレーム化）
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
        fps: 60, // ★ 60fpsフルレート
        seed: Math.floor(Math.random() * 9999999),
      });

      // ★ ユーザー指示：「勝手にお任せで流して」
      if (J.omakase) {
        J.omakase(project);
      }

      // ★ 超重要：Lyrimoのデフォルト12fpsコマ落ち制限を解除し、60fpsフル滑らか描画を強制！
      if (project.fx) {
        project.fx.koma = 0; // 0 = 毎フレーム描画（コマ落ちなし）
        project.fx.onTwos = false; // 2コマ打ち解除
      }
      project.fps = 60;

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

  // 3. コンテナのリサイズ監視でCanvasサイズを事前固定（毎フレームのレイアウト再計算を完全防止）
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isPlanReady) return;

    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const plan = planRef.current;
      if (!canvas || !plan) return;

      const rect = container.getBoundingClientRect();
      const cssW = Math.max(320, rect.width || 640);
      const dpr = Math.min(1.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      const targetW = Math.round(cssW * dpr);
      const targetH = Math.round((targetW * plan.H) / plan.W);
      const scale = targetW / plan.W;

      scaleRef.current = scale;
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    const ro = new ResizeObserver(() => {
      updateCanvasSize();
    });
    ro.observe(container);
    updateCanvasSize();

    return () => ro.disconnect();
  }, [isPlanReady, isFullscreen]);

  // 4. 超高精度 60fps/120fps requestAnimationFrame ループ
  useEffect(() => {
    if (viewMode !== "lyrimo" || !isPlanReady) return;

    let slowCount = 0;
    let isSlow = false;

    const drawSingleFrame = () => {
      const canvas = canvasRef.current;
      const plan = planRef.current;
      const renderer = rendererRef.current;

      if (!canvas || !plan || !renderer) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // ★ getExactTime() で生のマイクロ秒単位の再生時刻を毎フレーム取得！
      const t = isThisSongActive ? getExactTime() : 0;
      const t0 = performance.now();

      try {
        renderer.frame(ctx, plan, t, { scale: scaleRef.current, fast: isSlow });
      } catch {
        // ignore
      }

      const dt = performance.now() - t0;
      if (dt > 25) slowCount++;
      else if (slowCount > 0) slowCount--;
      isSlow = slowCount > 4;
    };

    if (isThisSongActive && isPlaying) {
      const loop = () => {
        drawSingleFrame();
        animFrameIdRef.current = requestAnimationFrame(loop);
      };
      animFrameIdRef.current = requestAnimationFrame(loop);
    } else {
      // 一時停止時やシーク時は現在の静止画を即座に1回描画
      drawSingleFrame();
    }

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [viewMode, isPlanReady, isThisSongActive, isPlaying, getExactTime, currentTime]);

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
      className={`transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-[100] bg-slate-950 p-4 sm:p-8 flex flex-col justify-between"
          : "bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-xs"
      }`}
    >
      {/* ヘッダー操作パネル */}
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

      {/* ＝＝＝ モード 1: 🔥 Lyrimo（リリモ）60fps 超スムーズ Canvasステージ ＝＝＝ */}
      {viewMode === "lyrimo" && (
        <div
          ref={containerRef}
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
            className="w-full h-full object-contain cursor-pointer block"
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
              ⚡ 60FPS LYRIMO ENGINE
            </span>
          </div>
        </div>
      )}

      {/* ＝＝＝ モード 2: 📜 ハイライト一覧モード ＝＝＝ */}
      {viewMode === "highlight" && (
        <div
          style={{
            fontFamily: '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "Noto Serif JP", serif',
          }}
          className={`overflow-y-auto rounded-2xl p-4 sm:p-8 transition-all font-serif ${
            isFullscreen
              ? "flex-1 bg-slate-950 text-slate-100"
              : "h-80 sm:h-96 md:h-[28rem] bg-white border border-slate-100 shadow-xs"
          }`}
        >
          <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 py-6 px-2">
            {lyricLines.map((line, idx) => {
              const isActive = idx === activeIndex;

              return (
                <div
                  key={line.id}
                  ref={isActive ? activeListRef : null}
                  onClick={() => handleSeek(line.time)}
                  className={`cursor-pointer transition-all duration-300 select-none py-1.5 px-3 rounded-xl ${
                    isActive
                      ? isFullscreen
                        ? "text-white font-bold text-lg sm:text-2xl scale-[1.03] origin-left drop-shadow-md"
                        : "text-slate-950 font-bold text-lg sm:text-2xl scale-[1.03] origin-left drop-shadow-xs"
                      : isFullscreen
                      ? "text-slate-500 hover:text-slate-300 text-base sm:text-lg leading-relaxed font-normal"
                      : "text-slate-400 hover:text-slate-600 text-base sm:text-lg leading-relaxed font-normal"
                  }`}
                >
                  <p className="tracking-wide leading-relaxed">{line.text}</p>
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
