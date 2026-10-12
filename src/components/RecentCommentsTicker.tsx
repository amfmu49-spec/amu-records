"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export interface CommentTickerItem {
  id: string;
  song_id: string;
  song_title: string;
  artist_name: string;
  created_at: string;
}

interface RecentCommentsTickerProps {
  initialComments?: CommentTickerItem[];
}

export default function RecentCommentsTicker({ initialComments = [] }: RecentCommentsTickerProps) {
  const [comments, setComments] = useState<CommentTickerItem[]>(initialComments);
  const supabase = createClient();

  // 最新コメント一覧の取得処理
  const fetchLatestComments = async () => {
    try {
      const { data: commentsData, error: cErr } = await supabase
        .from("amu_comments")
        .select("id, song_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (cErr || !commentsData || commentsData.length === 0) return;

      const songIds = [...new Set(commentsData.map((c) => c.song_id))];
      const { data: songsData } = await supabase
        .from("songs")
        .select("id, title, artist, profiles:profiles!fk_user_profile(artist_name)")
        .in("id", songIds);

      const songMap = new Map<string, { title: string; artist_name: string }>();
      songsData?.forEach((s: any) => {
        songMap.set(s.id, {
          title: s.title || "曲",
          artist_name: s.artist || s.profiles?.artist_name || "クリエイター",
        });
      });

      const items: CommentTickerItem[] = commentsData
        .map((c) => {
          const song = songMap.get(c.song_id);
          if (!song) return null;
          return {
            id: c.id,
            song_id: c.song_id,
            song_title: song.title,
            artist_name: song.artist_name,
            created_at: c.created_at,
          };
        })
        .filter((item): item is CommentTickerItem => item !== null);

      if (items.length > 0) {
        setComments(items);
      }
    } catch (e) {
      console.error("Failed to fetch latest comments for ticker:", e);
    }
  };

  useEffect(() => {
    if (initialComments.length === 0) {
      fetchLatestComments();
    }

    // 新規コメント投稿のリアルタイム購読
    const channel = supabase
      .channel("realtime-comments-ticker")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "amu_comments" },
        () => {
          fetchLatestComments();
        }
      )
      .subscribe();

    // 60秒ごとのポーリング更新（念のためのフォールバック）
    const interval = setInterval(fetchLatestComments, 60000);

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

  if (!comments || comments.length === 0) {
    return null;
  }

  // 無限スクロール用に2組並べる
  const displayItems = [...comments, ...comments];

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
            <span>💬</span>
            <span className="hidden sm:inline">コメント速報</span>
            <span className="sm:hidden">速報</span>
          </span>
        </div>

        {/* 左右のフェードグラデーションマスク */}
        <div className="pointer-events-none absolute left-[88px] sm:left-[118px] top-0 bottom-0 w-6 bg-gradient-to-r from-slate-50 to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-50 to-transparent z-10" />

        {/* スクロールティッカー本体 */}
        <div className="overflow-hidden flex-1 relative ml-2 sm:ml-3">
          <div className="flex w-max items-center animate-ticker group-hover:[animation-play-state:paused]">
            {displayItems.map((item, index) => {
              const timeText = formatTime(item.created_at);
              return (
                <Link
                  key={`${item.id}-${index}`}
                  href={`/song/${item.song_id}#comments`}
                  className="flex items-center gap-2 px-3 py-0.5 text-xs text-slate-700 hover:text-indigo-600 transition-colors whitespace-nowrap cursor-pointer select-none"
                  title="クリックしてこの曲のコメントを見る"
                >
                  <span className="font-mono font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px] tracking-tight">
                    {timeText}
                  </span>
                  <span className="font-semibold text-slate-900 hover:underline">
                    {item.song_title}
                    <span className="text-slate-400 font-normal mx-1">/</span>
                    <span className="text-slate-600">{item.artist_name}</span>
                  </span>
                  <span className="text-slate-500 font-normal text-[11px]">
                    が コメントされました
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
