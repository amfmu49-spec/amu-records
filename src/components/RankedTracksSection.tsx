"use client";

import { useState } from "react";
import TrackList from "@/components/TrackList";
import { RankedSong } from "@/utils/ranking";

export default function RankedTracksSection({
  weeklySongs,
  allTimeSongs,
  currentUserId,
}: {
  weeklySongs: RankedSong[];
  allTimeSongs: RankedSong[];
  currentUserId?: string;
}) {
  const [activeTab, setActiveTab] = useState<"weekly" | "allTime">("weekly");

  const currentList = activeTab === "weekly" ? weeklySongs : allTimeSongs;

  return (
    <div className="min-w-0">
      {/* セクションヘッダー ＆ タブ切り替えバー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        {/* セクションタイトル */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-rose-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </span>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>人気のトラック</span>
              <span className="text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200/80 tracking-wider">
                RANKING
              </span>
            </h2>
          </div>
        </div>

        {/* タブ切り替えスイッチ (今週 / 累計) */}
        <div className="flex items-center p-1 rounded-2xl bg-slate-100 border border-slate-200/80 self-start sm:self-auto shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab("weekly")}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
              activeTab === "weekly"
                ? "bg-white text-rose-600 shadow-sm border border-slate-200/60"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            <span>🔥</span>
            <span>今週のランク</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("allTime")}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
              activeTab === "allTime"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-200/60"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            <span>🏆</span>
            <span>累計ランク</span>
          </button>
        </div>
      </div>

      {/* スコア計算ルール説明バナー */}
      <div className="mb-4 sm:mb-6 p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-slate-50 via-rose-50/30 to-indigo-50/30 border border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-600 font-medium">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-slate-800">
            {activeTab === "weekly" ? "【今週のランキング】" : "【累計総合ランキング】"}
          </span>
          <span className="text-slate-400 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5 font-bold text-slate-700 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
              再生 <b className="text-rose-600">1P</b>
            </span>
            <span>+</span>
            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
              いいね <b className="text-rose-600">2P</b>
            </span>
            <span>+</span>
            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
              コメント(3文字以上) <b className="text-rose-600">3P</b>
            </span>
          </div>
        </div>

        <div className="text-[10px] sm:text-[11px] text-slate-400 font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>{activeTab === "weekly" ? "毎週月曜0時リセット" : "全期間の総合実績"}</span>
        </div>
      </div>

      {/* 楽曲リスト表示 */}
      {currentList.length > 0 ? (
        <TrackList
          songs={currentList}
          currentUserId={currentUserId}
          showRank={true}
          limit={5}
        />
      ) : (
        <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <p className="text-slate-400 font-bold text-sm">
            {activeTab === "weekly"
              ? "今週はまだランキングデータがありません。最初の再生・いいね・コメントで1位に！"
              : "まだランキング対象の楽曲がありません。"}
          </p>
        </div>
      )}
    </div>
  );
}
