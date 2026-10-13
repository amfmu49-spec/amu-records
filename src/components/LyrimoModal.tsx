"use client";

import { useEffect } from "react";
import SongLyricsPlayer from "@/components/SongLyricsPlayer";
import { useAudioPlayer } from "@/components/AudioPlayerProvider";
import Link from "next/link";

interface LyrimoModalProps {
  song: any | null;
  onClose: () => void;
}

export default function LyrimoModal({ song, onClose }: LyrimoModalProps) {
  const { currentSong, isPlaying, playSong } = useAudioPlayer();

  // モーダルオープン時、もしその曲が再生されていなければ自動で再生を開始
  useEffect(() => {
    if (!song) return;

    if (currentSong?.id !== song.id || !isPlaying) {
      playSong({
        id: song.id,
        title: song.title,
        file_url: song.file_url,
        cover_url: song.cover_url || null,
        artist: song.artist,
        user_id: song.user_id,
        co_artist_id_1: song.co_artist_id_1,
        co_artist_id_2: song.co_artist_id_2,
      });
    }

    // ESCキーで閉じる
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // 背景スクロールを一時抑制
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [song]);

  if (!song) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0 pr-3">
            <span className="text-xl shrink-0">🎬</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-pink-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                  Lyrimo 小窓シアター
                </span>
                <span className="text-xs text-slate-400 font-semibold hidden sm:inline">
                  文字PV ＆ 歌詞同期
                </span>
              </div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base truncate tracking-tight mt-0.5">
                {song.title}
                {song.artist && (
                  <span className="text-xs text-slate-500 font-normal ml-2">
                    - {song.artist}
                  </span>
                )}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 曲詳細ページへのリンク */}
            <Link
              href={`/song/${song.id}`}
              onClick={onClose}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 text-xs font-bold text-slate-700 transition-colors shadow-2xs"
              title="大画面の曲詳細ページを開く"
            >
              <span>曲詳細</span>
              <span>↗</span>
            </Link>

            {/* 閉じるボタン */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white hover:bg-slate-200 text-slate-500 hover:text-slate-800 border border-slate-200 flex items-center justify-center font-bold text-sm transition-colors shadow-2xs cursor-pointer"
              title="小窓を閉じる (ESC)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* モーダルボディ：Lyrimo プレイヤー本体（動画PV & ハイライト一覧の両方をサポート） */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 bg-white">
          <SongLyricsPlayer
            song={{
              id: song.id,
              title: song.title,
              file_url: song.file_url,
              cover_url: song.cover_url || null,
              artist: song.artist,
            }}
            syncedLyrics={song.synced_lyrics}
          />
        </div>

        {/* モーダルフッター */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 truncate">
            <span>✨</span>
            <span className="truncate">小窓でリリモ動画またはリリック一覧を楽しめます</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors shrink-0 cursor-pointer ml-2"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
