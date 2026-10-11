"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAudioPlayer } from "@/components/AudioPlayerProvider";
import { parseLrc, findActiveLyricIndex, LyricLine, formatSecondsToTimestamp } from "@/utils/lrcParser";

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

// Lyrimoのモーションスタイル定義
type LyrimoStyle = "kinetic" | "glitch" | "neon" | "bounce";

const LYRIMO_STYLES: { id: LyrimoStyle; label: string; icon: string }[] = [
  { id: "kinetic", label: "キネティック", icon: "💥" },
  { id: "glitch", label: "グリッチ", icon: "⚡" },
  { id: "neon", label: "ネオングロー", icon: "✨" },
  { id: "bounce", label: "バウンス", icon: "🎾" },
];

export default function SongLyricsPlayer({ syncedLyrics, song }: SongLyricsPlayerProps) {
  const { currentSong, isPlaying, currentTime, duration, playSong, seekTo } = useAudioPlayer();
  const [viewMode, setViewMode] = useState<"lyrimo" | "highlight">("lyrimo");
  const [lyrimoStyle, setLyrimoStyle] = useState<LyrimoStyle>("kinetic");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // パースしたタイムスタンプ付き歌詞
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

  const activeLine = activeIndex >= 0 ? lyricLines[activeIndex] : null;

  // 現在行の進行割合 (0.0 〜 1.0)
  const lineProgress = useMemo(() => {
    if (!activeLine || !isThisSongActive) return 0;
    const nextLine = lyricLines[activeIndex + 1];
    const duration = nextLine ? Math.max(0.8, nextLine.time - activeLine.time) : 4.0;
    const elapsed = Math.max(0, currentTime - activeLine.time);
    return Math.min(1, elapsed / duration);
  }, [activeLine, activeIndex, currentTime, isThisSongActive, lyricLines]);

  const activeListRef = useRef<HTMLDivElement>(null);

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
    playSong({
      id: song.id,
      title: song.title,
      file_url: song.file_url,
      cover_url: song.cover_url || null,
      artist: song.artist,
    });
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
          マイページの「曲の編集」から [00:15] 形式でタイムスタンプ付き歌詞を登録すると、ここで文字PVアプリ『Lyrimo（リリモ）』のリリックモーションを楽しめます！
        </p>
      </div>
    );
  }

  return (
    <div className={`transition-all duration-300 ${isFullscreen ? "fixed inset-0 z-[100] bg-slate-950 p-4 sm:p-8 flex flex-col justify-between" : "bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-xs"}`}>
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
              <span>Lyrimo モード (文字PV)</span>
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
              <span>ハイライト一覧モード</span>
            </button>
          </div>

          {/* Lyrimoモード専用: モーションスタイル切り替え */}
          {viewMode === "lyrimo" && (
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              {LYRIMO_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setLyrimoStyle(st.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 border ${
                    lyrimoStyle === st.id
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs scale-102"
                      : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="mr-1">{st.icon}</span>
                  <span>{st.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {!isThisSongActive && (
            <button
              type="button"
              onClick={handlePlayThisSong}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <span>▶</span>
              <span>再生して同期</span>
            </button>
          )}

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

      {/* ＝＝＝ モード 1: 🔥 Lyrimo（リリモ）文字PVモーションステージ ＝＝＝ */}
      {viewMode === "lyrimo" && (
        <div
          className={`relative overflow-hidden rounded-2xl flex flex-col items-center justify-center select-none ${
            isFullscreen
              ? "flex-1 w-full bg-slate-950"
              : "w-full h-80 sm:h-96 md:h-[26rem] bg-slate-950 shadow-2xl border border-slate-800"
          }`}
        >
          {/* 背景：カバーアートぼかし＋アンビエントネオン */}
          {song.cover_url && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-25 filter blur-3xl scale-125 pointer-events-none transition-all duration-700"
              style={{ backgroundImage: `url(${song.cover_url})` }}
            />
          )}

          {/* グリッド/スキャンライン装飾 */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* Lyrimo ウォーターマークバッジ */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 pointer-events-none">
            <span className="text-[10px] font-mono tracking-widest text-indigo-400 bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-800/60 uppercase">
              LYRIMO MOTION STAGE
            </span>
          </div>

          {/* 前後のフレーズ予告（上下に薄く表示） */}
          <div className="absolute top-8 sm:top-10 inset-x-0 text-center z-10 pointer-events-none px-6">
            <p className="text-xs sm:text-sm text-slate-500/50 font-bold truncate transition-all duration-500">
              {activeIndex > 0 ? lyricLines[activeIndex - 1]?.text : ""}
            </p>
          </div>

          {/* メイン文字モーション表示エリア */}
          <div className="relative z-20 max-w-4xl px-6 text-center w-full">
            {activeLine ? (
              <div
                key={activeLine.id}
                className="transition-all duration-200"
                style={{
                  transform:
                    lyrimoStyle === "kinetic"
                      ? `scale(${1 + Math.sin(lineProgress * Math.PI) * 0.12}) translateY(${Math.sin(lineProgress * Math.PI) * -8}px)`
                      : lyrimoStyle === "bounce"
                      ? `scale(${0.9 + (1 - Math.pow(1 - Math.min(1, lineProgress * 3), 3)) * 0.2})`
                      : lyrimoStyle === "glitch"
                      ? `skewX(${(Math.random() - 0.5) * (lineProgress < 0.2 ? 14 : 2)}deg)`
                      : "none",
                }}
              >
                {/* グリッチ用のRGBズレレイヤー */}
                {lyrimoStyle === "glitch" && (
                  <div className="relative inline-block">
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 text-cyan-400 opacity-70 filter blur-[1px] select-none translate-x-1"
                    >
                      {activeLine.text}
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 text-rose-500 opacity-70 filter blur-[1px] select-none -translate-x-1"
                    >
                      {activeLine.text}
                    </span>
                  </div>
                )}

                {/* メインの巨大テキスト */}
                <h2
                  className={`font-black tracking-wider leading-tight select-none transition-all ${
                    lyrimoStyle === "neon"
                      ? "text-3xl sm:text-5xl md:text-6xl text-white drop-shadow-[0_0_20px_rgba(99,102,241,1)] drop-shadow-[0_0_45px_rgba(236,72,153,0.8)]"
                      : lyrimoStyle === "kinetic"
                      ? "text-3xl sm:text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-rose-300 to-indigo-200 drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
                      : lyrimoStyle === "bounce"
                      ? "text-3xl sm:text-5xl md:text-6xl text-amber-300 drop-shadow-[0_4px_25px_rgba(251,191,36,0.6)]"
                      : "text-3xl sm:text-5xl md:text-6xl text-white drop-shadow-2xl"
                  }`}
                >
                  {activeLine.text}
                </h2>

                {/* フレーズの進行バー */}
                <div className="w-32 sm:w-48 h-1 bg-white/10 rounded-full mx-auto mt-6 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all duration-75"
                    style={{ width: `${lineProgress * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm sm:text-base font-bold animate-pulse">
                {isThisSongActive ? "(イントロ / 間奏再生中...)" : "再生ボタンを押してLyrimo文字PVを開始"}
              </div>
            )}
          </div>

          {/* 次のフレーズ予告（下部に薄く表示） */}
          <div className="absolute bottom-8 sm:bottom-10 inset-x-0 text-center z-10 pointer-events-none px-6">
            <p className="text-xs sm:text-sm text-slate-400/40 font-bold truncate transition-all duration-500">
              {activeIndex + 1 < lyricLines.length ? `NEXT: ${lyricLines[activeIndex + 1]?.text}` : ""}
            </p>
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
        <span>💡 タイムスタンプに合わせてLyrimoリリックモーションが自動同期します</span>
        <span>全 {lyricLines.length} フレーズ</span>
      </div>
    </div>
  );
}
