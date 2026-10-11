"use client";

import { useState } from "react";
import Link from "next/link";

interface FeaturedPlaylistsSectionProps {
  playlists: any[];
}

export default function FeaturedPlaylistsSection({ playlists }: FeaturedPlaylistsSectionProps) {
  const [showAll, setShowAll] = useState(false);

  if (!playlists || playlists.length === 0) {
    return (
      <div className="p-8 sm:p-10 bg-white border border-slate-200 border-dashed rounded-3xl text-center">
        <span className="text-3xl mb-2 block">🎵</span>
        <p className="text-slate-700 font-extrabold text-sm sm:text-base mb-1">
          まだ公開プレイリストがありません
        </p>
        <p className="text-slate-400 text-xs mb-4">
          各曲の「追加」ボタンやマイページから、お気に入りの曲を集めたプレイリストを作成・公開できます！
        </p>
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
        >
          プレイリストを作成する
        </Link>
      </div>
    );
  }

  const latestPlaylist = playlists[0];
  const otherPlaylists = playlists.slice(1);

  const getCovers = (pl: any) =>
    (pl.playlist_songs || [])
      .map((ps: any) => ps.songs?.cover_url)
      .filter(Boolean);

  const latestCovers = getCovers(latestPlaylist);

  return (
    <div className="space-y-4">
      {/* 👑 最新1件の注目プレイリスト（大きく魅力的なフィーチャーカード） */}
      <Link
        href={`/playlist/${latestPlaylist.id}`}
        className="group relative block overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 p-6 sm:p-8 text-white shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.008] border border-indigo-500/20"
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6 justify-between">
          <div className="flex items-center gap-5 min-w-0">
            {/* アートワーク（4分割または単体） */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-slate-800 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center relative shadow-md group-hover:rotate-1 transition-transform">
              {latestCovers.length >= 4 ? (
                <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                  {latestCovers.slice(0, 4).map((url: string, i: number) => (
                    <img key={i} src={url} alt="cover" className="w-full h-full object-cover" />
                  ))}
                </div>
              ) : latestCovers.length > 0 ? (
                <img
                  src={latestCovers[0]}
                  alt="cover"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <span className="text-slate-400 text-3xl">🎧</span>
              )}
            </div>

            {/* テキスト情報 */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 uppercase tracking-wider shadow-2xs">
                  <span>✨</span>
                  <span>NEW FEATURED</span>
                </span>
                <span className="text-[10px] sm:text-xs font-extrabold px-2 py-0.5 rounded-md bg-white/10 text-purple-200 border border-white/10">
                  {latestPlaylist.playlist_songs?.length || 0}曲 収録
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-indigo-300 transition-colors truncate">
                {latestPlaylist.title}
              </h3>

              {latestPlaylist.profiles && (
                <p className="text-xs sm:text-sm text-slate-300 font-semibold truncate mt-1">
                  Curated by {latestPlaylist.profiles.artist_name}
                </p>
              )}

              {latestPlaylist.description && (
                <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed max-w-xl">
                  {latestPlaylist.description}
                </p>
              )}
            </div>
          </div>

          {/* 聴くボタン */}
          <div className="shrink-0 flex items-center justify-end">
            <span className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 group-hover:bg-indigo-500 text-white text-xs sm:text-sm font-black shadow-lg shadow-indigo-600/30 transition-all group-hover:translate-x-1">
              <span>プレイリストを聴く</span>
              <span>→</span>
            </span>
          </div>
        </div>
      </Link>

      {/* 残りのプレイリストがある場合の「もっと見る」アコーディオン */}
      {otherPlaylists.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              <span>{showAll ? "▲ 閉じる" : "▼ 他のプレイリストをもっと見る"}</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[10px] font-black">
                +{otherPlaylists.length}件
              </span>
            </button>
          </div>

          {showAll && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4 animate-fade-in">
              {otherPlaylists.map((pl: any) => {
                const covers = getCovers(pl);

                return (
                  <Link
                    key={pl.id}
                    href={`/playlist/${pl.id}`}
                    className="group bg-white border border-slate-200/90 rounded-2xl p-4 transition-all duration-300 hover:shadow-lg hover:border-slate-300 flex flex-col justify-between"
                  >
                    <div className="flex items-center gap-3.5 mb-3">
                      <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center relative shadow-xs">
                        {covers.length >= 4 ? (
                          <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                            {covers.slice(0, 4).map((url: string, i: number) => (
                              <img key={i} src={url} alt="cover" className="w-full h-full object-cover" />
                            ))}
                          </div>
                        ) : covers.length > 0 ? (
                          <img
                            src={covers[0]}
                            alt="cover"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <span className="text-slate-400 text-xl">🎵</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                          {pl.title}
                        </h4>
                        {pl.profiles && (
                          <p className="text-xs text-slate-500 font-semibold truncate mt-0.5">
                            by {pl.profiles.artist_name}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-purple-50 text-purple-600 border border-purple-100">
                            {pl.playlist_songs?.length || 0}曲
                          </span>
                        </div>
                      </div>
                    </div>

                    {pl.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1 mb-2">
                        {pl.description}
                      </p>
                    )}

                    <div className="flex items-center justify-end pt-2 border-t border-slate-100 text-xs font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                      <span>プレイリストを聴く →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
