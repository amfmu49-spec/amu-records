"use client";

import { useState, useMemo } from "react";
import TrackList from "@/components/TrackList";

interface SongSearchSectionProps {
  songs: any[];
  currentUserId?: string;
  children: React.ReactNode;
}

export default function SongSearchSection({
  songs,
  currentUserId,
  children,
}: SongSearchSectionProps) {
  const [query, setQuery] = useState("");

  // 検索クエリによるリアルタイム楽曲フィルタリング
  const filteredSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return (songs || []).filter((song) => {
      // 1. タイトル
      const titleMatch = (song.title || "").toLowerCase().includes(q);

      // 2. メインアーティスト
      const mainArtist = (song.profiles?.artist_name || song.artist || "").toLowerCase();
      const artistMatch = mainArtist.includes(q);

      // 3. コラボアーティスト
      const co1 = (song.co_artist_1?.artist_name || "").toLowerCase();
      const co2 = (song.co_artist_2?.artist_name || "").toLowerCase();
      const coMatch = co1.includes(q) || co2.includes(q);

      // 4. 曲の説明文
      const descMatch = (song.description || "").toLowerCase().includes(q);

      return titleMatch || artistMatch || coMatch || descMatch;
    });
  }, [songs, query]);

  const isSearching = query.trim().length > 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 検索入力バー */}
      <div className="relative max-w-2xl mx-auto">
        <div className="relative flex items-center">
          <div className="absolute left-4 pointer-events-none text-slate-400">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="曲名、アーティスト名、コラボで検索..."
            className="w-full pl-11 sm:pl-12 pr-10 py-3 sm:py-3.5 rounded-full bg-white border border-slate-200/90 shadow-sm text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3.5 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs transition-colors cursor-pointer"
              title="クリア"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 検索中の結果表示 */}
      {isSearching ? (
        <div className="space-y-4 animate-fade-in pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                🔍
              </span>
              <span>「{query.trim()}」の検索結果</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 ml-1">
                {filteredSongs.length}件
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
            >
              検索を解除
            </button>
          </div>

          {filteredSongs.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 border-dashed p-6">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">一致する楽曲が見つかりませんでした</p>
              <p className="text-xs text-slate-400">
                曲名の一部やアーティスト名を変えて再度検索してみてください。
              </p>
            </div>
          ) : (
            <TrackList songs={filteredSongs} currentUserId={currentUserId} />
          )}
        </div>
      ) : (
        /* 通常のトップ画面（未検索時） */
        children
      )}
    </div>
  );
}
