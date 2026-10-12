"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export interface ActivityTickerItem {
  id: string;
  type: "comment" | "like";
  song_id: string;
  song_title: string;
  artist_name: string;
  created_at: string;
}

// 既存コードとの後方互換用エイリアス
export type CommentTickerItem = ActivityTickerItem;

interface RecentCommentsTickerProps {
  initialActivities?: ActivityTickerItem[];
  initialComments?: ActivityTickerItem[]; // 互換用
}

export default function RecentCommentsTicker({
  initialActivities,
  initialComments,
}: RecentCommentsTickerProps) {
  const [activities, setActivities] = useState<ActivityTickerItem[]>(
    initialActivities || initialComments || []
  );
  const supabase = createClient();

  // 最新コメント＆最新いいねを合算して直近5件を取得
  const fetchLatestActivities = async () => {
    try {
      const [commentsRes, likesRes] = await Promise.all([
        supabase
          .from("amu_comments")
          .select("id, song_id, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("likes")
          .select("id, song_id, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const commentsData = commentsRes.data || [];
      const likesData = likesRes.data || [];

      if (commentsData.length === 0 && likesData.length === 0) return;

      const songIds = [
        ...new Set([
          ...commentsData.map((c) => c.song_id),
          ...likesData.map((l) => l.song_id),
        ]),
      ].filter(Boolean);

      const { data: songsData } = await supabase
        .from("songs")
        .select("id, title, artist, profiles:profiles!fk_user_profile(artist_name)")
        .in("id", songIds);

      const songMap = new Map<string, { title: string; artist_name: string }>();
      songsData?.forEach((s: any) => {
        songMap.set(s.id, {
          title: s.title || "楽曲",
          artist_name: s.artist || s.profiles?.artist_name || "クリエイター",
        });
      });

      const items: ActivityTickerItem[] = [];

      commentsData.forEach((c) => {
        const song = songMap.get(c.song_id);
        if (song) {
          items.push({
            id: c.id,
            type: "comment",
            song_id: c.song_id,
            song_title: song.title,
            artist_name: song.artist_name,
            created_at: c.created_at,
          });
        }
      });

      likesData.forEach((l) => {
        const song = songMap.get(l.song_id);
        if (song) {
          items.push({
            id: l.id,
            type: "like",
            song_id: l.song_id,
            song_title: song.title,
            artist_name: song.artist_name,
            created_at: l.created_at,
          });
        }
      });

      // 新しい順にソートし、直近5件に絞る
      items.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const top5 = items.slice(0, 5);

      if (top5.length > 0) {
        setActivities(top5);
      }
    } catch (e) {
      console.error("Failed to fetch latest activities for ticker:", e);
    }
  };

  useEffect(() => {
    if (activities.length === 0) {
      fetchLatestActivities();
    }

    // コメント・いいねのリアルタイム購読
    const channel = supabase
      .channel("realtime-activity-ticker")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "amu_comments" },
        () => fetchLatestActivities()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "likes" },
        () => fetchLatestActivities()
      )
      .subscribe();

    // 60秒ごとのポーリング更新（念のためのフォールバック）
    const interval = setInterval(fetchLatestActivities, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  // 時刻フォーマット（例: "19:00" または "10/11 19:00"）
  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

      const timeStr = d.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Tokyo",
      });

      if (isToday) {
        return timeStr;
      }
      return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`;
    } catch {
      return "";
    }
  };

  if (!activities || activities.length === 0) {
    return null;
  }

  // 無限スクロール用に2組並べる
  const displayItems = [...activities, ...activities];

  return (
    <div className="w-full mb-3 sm:mb-4 group">
      <div className="relative flex items-center bg-slate-50/95 hover:bg-slate-100/90 border border-slate-200/80 rounded-2xl px-3 py-2 shadow-2xs overflow-hidden transition-colors">
        {/* 左端の固定バッジラベル */}
        <div className="flex items-center gap-1.5 shrink-0 z-10 bg-slate-50 pr-3 border-r border-slate-200/80">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
          </span>
          <span className="text-[11px] font-black tracking-wider text-slate-700 whitespace-nowrap flex items-center gap-1">
            <span>✨</span>
            <span className="hidden sm:inline">最新アクティビティ</span>
            <span className="sm:hidden">速報</span>
          </span>
        </div>

        {/* 左右のフェードグラデーションマスク */}
        <div className="pointer-events-none absolute left-[84px] sm:left-[130px] top-0 bottom-0 w-6 bg-gradient-to-r from-slate-50 to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-50 to-transparent z-10" />

        {/* スクロールティッカー本体 */}
        <div className="overflow-hidden flex-1 relative ml-2 sm:ml-3">
          <div className="flex w-max items-center animate-ticker group-hover:[animation-play-state:paused]">
            {displayItems.map((item, index) => {
              const timeText = formatTime(item.created_at);
              const isComment = item.type === "comment";
              const targetHref = isComment
                ? `/song/${item.song_id}#comment-${item.id}`
                : `/song/${item.song_id}`;

              return (
                <Link
                  key={`${item.type}-${item.id}-${index}`}
                  href={targetHref}
                  className="flex items-center gap-2 px-3 py-0.5 text-xs text-slate-700 hover:text-indigo-600 transition-colors whitespace-nowrap cursor-pointer select-none group/item"
                  title={
                    isComment
                      ? "クリックしてこのコメントにジャンプ"
                      : "クリックしてこの楽曲ページを開く"
                  }
                >
                  <span className="font-mono font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px] tracking-tight">
                    {timeText}
                  </span>

                  {/* タイプ別アイコンバッジ */}
                  <span
                    className={`inline-flex items-center justify-center text-[11px] px-1.5 py-0.5 rounded-md font-bold leading-none ${
                      isComment
                        ? "bg-indigo-50 text-indigo-600 border border-indigo-200/60"
                        : "bg-rose-50 text-rose-600 border border-rose-200/60"
                    }`}
                  >
                    {isComment ? "💬" : "❤️"}
                  </span>

                  <span className="font-semibold text-slate-900 group-hover/item:text-indigo-600 group-hover/item:underline">
                    {item.song_title}
                    <span className="text-slate-400 font-normal mx-1">/</span>
                    <span className="text-slate-600">{item.artist_name}</span>
                  </span>

                  <span
                    className={`font-medium text-[11px] ${
                      isComment ? "text-slate-500" : "text-rose-600"
                    }`}
                  >
                    {isComment ? "が コメントされました" : "が いいねされました"}
                  </span>

                  <span className="text-slate-300 font-bold ml-3 mr-1">•</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
