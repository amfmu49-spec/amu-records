"use client";

import { useAudioPlayer } from "@/components/AudioPlayerProvider";

export default function RandomPlayButton({ songs }: { songs: any[] }) {
  const { startRandomPlay, isRandom, isPlaying, playNextSong } = useAudioPlayer();

  const handleRandomClick = () => {
    if (!songs || songs.length === 0) return;

    if (isRandom && isPlaying) {
      // すでにランダム再生中の場合は次の曲へクロスフェード
      playNextSong();
    } else {
      // ランダム自動再生を開始（全曲プールを渡す）
      startRandomPlay(songs);
    }
  };

  if (!songs || songs.length === 0) return null;

  const isActive = isRandom && isPlaying;

  return (
    <button
      type="button"
      onClick={handleRandomClick}
      title={isActive ? "次の曲へクロスフェード" : "全曲からランダム自動再生（クロスフェード）"}
      className={`inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full font-extrabold text-xs sm:text-sm shadow-md transition-all select-none cursor-pointer shrink-0 active:scale-95 ${
        isActive
          ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/25 ring-2 ring-indigo-400/50"
          : "bg-slate-900 hover:bg-slate-800 text-white"
      }`}
    >
      <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current ${isActive ? "animate-pulse" : ""}`} viewBox="0 0 24 24">
        <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
      </svg>
      <span>{isActive ? "次の曲へ (Crossfade)" : "ランダム再生"}</span>
    </button>
  );
}
