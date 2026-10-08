"use client";

import { useAudioPlayer } from "@/components/AudioPlayerProvider";

export default function RandomPlayButton({ songs }: { songs: any[] }) {
  const { playSong } = useAudioPlayer();

  const playRandom = () => {
    if (!songs || songs.length === 0) return;
    const randomSong = songs[Math.floor(Math.random() * songs.length)];
    const artistName = randomSong.profiles?.artist_name || randomSong.artist || "Unknown Artist";
    playSong({
      id: randomSong.id,
      title: randomSong.title,
      file_url: randomSong.file_url,
      cover_url: randomSong.cover_url,
      artist: artistName,
    });
  };

  if (!songs || songs.length === 0) return null;

  return (
    <button 
      type="button"
      onClick={playRandom}
      className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-6 py-2 sm:py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-full font-bold text-xs sm:text-sm shadow-md transition-all select-none cursor-pointer shrink-0"
    >
      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
      ランダム再生
    </button>
  );
}
