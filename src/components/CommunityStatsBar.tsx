"use client";

import { useState } from "react";
import Link from "next/link";

export interface ArtistSummary {
  id: string;
  artist_name: string;
  avatar_url: string | null;
  song_count: number;
}

interface CommunityStatsBarProps {
  songCount: number;
  artistCount: number;
  artists: ArtistSummary[];
}

export default function CommunityStatsBar({
  songCount,
  artistCount,
  artists,
}: CommunityStatsBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-6 sm:mb-8">
      {/* 統計バッジ */}
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4">
        {/* 登録楽曲数 */}
        <div className="inline-flex items-center gap-2.5 bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm px-4 sm:px-5 py-2 sm:py-2.5 rounded-full hover:shadow-md transition-shadow">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
          </span>
          <span className="text-xs sm:text-sm font-semibold text-slate-500">登録楽曲数</span>
          <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
            {songCount}
            <span className="text-xs font-bold text-slate-500 ml-1">曲</span>
          </span>
        </div>

        {/* 参加アーティスト（タップで開閉） */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`inline-flex items-center gap-2.5 bg-white/90 backdrop-blur-md border shadow-sm px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-all cursor-pointer group active:scale-95 ${
            isOpen
              ? "border-purple-400 ring-2 ring-purple-100 bg-purple-50/40 shadow-md"
              : "border-slate-200/90 hover:border-purple-300 hover:shadow-md"
          }`}
          aria-expanded={isOpen}
          aria-label="参加アーティスト一覧を表示"
        >
          <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </span>
          <span className="text-xs sm:text-sm font-semibold text-slate-500">参加アーティスト</span>
          <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
            {artistCount}
            <span className="text-xs font-bold text-slate-500 ml-1">人</span>
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
              isOpen
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-purple-50 text-purple-600 border-purple-200 group-hover:bg-purple-100"
            }`}
          >
            {isOpen ? "閉じる ▲" : "一覧を表示 ▼"}
          </span>
        </button>
      </div>

      {/* タップ時に展開される参加アーティスト一覧 */}
      {isOpen && (
        <div className="mt-4 bg-white/95 backdrop-blur-xl border border-purple-100 rounded-3xl p-5 sm:p-6 shadow-xl shadow-purple-500/5 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                参加アーティスト一覧
                <span className="text-xs font-normal text-slate-500">（全{artists.length}名）</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                アーティストをタップすると専用ページに移動し、全楽曲やSNSをチェックできます
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 text-xs font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            >
              閉じる ✕
            </button>
          </div>

          {/* アーティストグリッド */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
            {artists.map((artist) => (
              <Link
                key={artist.id}
                href={`/artist/${artist.id}`}
                className="flex flex-col items-center p-3 rounded-2xl bg-slate-50/70 hover:bg-purple-50/50 border border-slate-200/60 hover:border-purple-300 transition-all duration-200 group text-center hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden mb-2.5 bg-slate-200 ring-2 ring-white shadow-md group-hover:ring-purple-400 group-hover:scale-105 transition-all">
                  {artist.avatar_url ? (
                    <img
                      src={artist.avatar_url}
                      alt={artist.artist_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-black text-xl">
                      {artist.artist_name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <span className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-purple-600 transition-colors line-clamp-1 w-full px-1">
                  {artist.artist_name}
                </span>
                <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-600 border border-slate-200/80 group-hover:bg-purple-100 group-hover:text-purple-700 group-hover:border-purple-200 transition-colors">
                  {artist.song_count}曲
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
