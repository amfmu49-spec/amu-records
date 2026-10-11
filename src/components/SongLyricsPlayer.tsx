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

export default function SongLyricsPlayer({ syncedLyrics, song }: SongLyricsPlayerProps) {
  const { currentSong, isPlaying, currentTime, duration, playSong, seekTo } = useAudioPlayer();
  const [viewMode, setViewMode] = useState<"ririmo" | "highlight">("ririmo");
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

  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // アクティブ行への自動スムーズスクロール
  useEffect(() => {
    if (activeLineRef.current && isThisSongActive) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex, isThisSongActive, viewMode]);

  // 行クリックでその位置にシーク
  const handleLineClick = (time: number) => {
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
          🎙️
        </div>
        <h3 className="text-base font-extrabold text-slate-900 mb-1">
          タイムスタンプ歌詞は未登録です
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          投稿者（クリエイター）は、マイページの「曲の編集」から [00:15] 形式のタイムスタンプ付き歌詞を登録すると、ここで美しいリリモ同期歌詞を楽しめます！
        </p>
      </div>
    );
  }

  return (
    <div className={`transition-all duration-300 ${isFullscreen ? "fixed inset-0 z-[100] bg-slate-950 p-4 sm:p-8 flex flex-col" : "bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-xs"}`}>
      {/* プレイヤーコントロールバー & モード切り替えタブ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100/80">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-black">
            <span>🎵</span>
            <span>LYRICS SYNC</span>
          </div>

          {/* モード切り替えタブ */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode("ririmo")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "ririmo"
                  ? "bg-white text-indigo-600 shadow-xs scale-102"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>✨</span>
              <span>リリモモード</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("highlight")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === "highlight"
                  ? "bg-white text-indigo-600 shadow-xs scale-102"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📜</span>
              <span>ハイライト一覧</span>
            </button>
          </div>
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

      {/* ＝＝＝ モード 1: リリモ（Ririmo）風リリックモード ＝＝＝ */}
      {viewMode === "ririmo" && (
        <div
          ref={containerRef}
          className={`relative overflow-y-auto rounded-2xl scroll-smooth transition-all ${
            isFullscreen
              ? "flex-1 bg-gradient-to-b from-slate-950 via-indigo-950/40 to-slate-950 p-6 sm:p-12"
              : "h-96 sm:h-[28rem] bg-gradient-to-b from-slate-900 via-indigo-950/80 to-slate-950 p-6 sm:p-10 shadow-inner"
          }`}
          style={{
            maskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
          }}
        >
          {/* カバーアート背景ブラー演出 */}
          {song.cover_url && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-10 pointer-events-none blur-3xl scale-125"
              style={{ backgroundImage: `url(${song.cover_url})` }}
            />
          )}

          <div className="relative z-10 max-w-2xl mx-auto py-32 space-y-8 sm:space-y-10 text-center">
            {lyricLines.map((line, idx) => {
              const isActive = idx === activeIndex;
              const isPast = idx < activeIndex;

              return (
                <div
                  key={line.id}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => handleLineClick(line.time)}
                  className={`group transition-all duration-500 cursor-pointer select-none rounded-2xl px-4 py-3 ${
                    isActive
                      ? "scale-110 sm:scale-115 text-white font-black drop-shadow-[0_0_25px_rgba(129,140,248,0.8)]"
                      : isPast
                      ? "text-slate-400/50 hover:text-slate-200 scale-95 font-bold"
                      : "text-slate-400/70 hover:text-slate-200 scale-95 font-bold"
                  }`}
                >
                  <p
                    className={`leading-relaxed tracking-wide transition-all ${
                      isActive
                        ? "text-2xl sm:text-3xl md:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-pink-200"
                        : "text-base sm:text-xl text-slate-400 group-hover:text-slate-200"
                    }`}
                  >
                    {line.text}
                  </p>

                  {/* タップでジャンプ案内（ホバー時） */}
                  <span className="text-[10px] text-indigo-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity mt-1 block">
                    ▶ タップしてこの位置から再生
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ＝＝＝ モード 2: ハイライト一覧モード ＝＝＝ */}
      {viewMode === "highlight" && (
        <div
          ref={containerRef}
          className={`overflow-y-auto rounded-2xl p-4 sm:p-6 transition-all ${
            isFullscreen
              ? "flex-1 bg-slate-900 text-slate-100"
              : "h-96 sm:h-[28rem] bg-slate-50 border border-slate-200/90"
          }`}
        >
          <div className="max-w-2xl mx-auto divide-y divide-slate-200/60 dark:divide-slate-800 space-y-1">
            {lyricLines.map((line, idx) => {
              const isActive = idx === activeIndex;

              return (
                <div
                  key={line.id}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => handleLineClick(line.time)}
                  className={`group p-3 sm:p-4 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-4 ${
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
                        isActive ? "font-black" : "font-semibold"
                      }`}
                    >
                      {line.text}
                    </span>
                  </div>

                  <span
                    className={`text-xs shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? "text-amber-300" : "text-slate-400 opacity-0 group-hover:opacity-100"
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

      {/* フッター補足説明 */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span>💡 歌詞の各行をタップするとその位置にジャンプします</span>
        <span>全 {lyricLines.length} 行</span>
      </div>
    </div>
  );
}
