"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

interface VisitCounts {
  today: number;
  total: number;
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const STORAGE_VISITOR_ID_KEY = "amu_records_visitor_id";
const STORAGE_LAST_COUNT_KEY = "amu_records_last_count_at";
const STORAGE_CACHED_COUNTS_KEY = "amu_records_cached_counts";

// UUID v4 生成フォールバック
function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "server-visitor";
  try {
    let vid = localStorage.getItem(STORAGE_VISITOR_ID_KEY);
    if (!vid) {
      vid = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "v_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_VISITOR_ID_KEY, vid);
    }
    return vid;
  } catch {
    return "guest_" + Date.now();
  }
}

export default function VisitorCounter() {
  const [counts, setCounts] = useState<VisitCounts>({ today: 1, total: 1 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function handleVisit() {
      // ローカルストレージの直近キャッシュを即座に表示してチラつきを防止
      try {
        const cached = localStorage.getItem(STORAGE_CACHED_COUNTS_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed.today === "number" && typeof parsed.total === "number") {
            setCounts(parsed);
          }
        }
      } catch {
        // ignore
      }

      const visitorId = getOrCreateVisitorId();
      const now = Date.now();
      let lastCountAt = 0;
      try {
        const rawLast = localStorage.getItem(STORAGE_LAST_COUNT_KEY);
        if (rawLast) lastCountAt = parseInt(rawLast, 10) || 0;
      } catch {
        // ignore
      }

      const shouldCount = !lastCountAt || (now - lastCountAt) >= TWELVE_HOURS_MS;

      try {
        if (shouldCount) {
          // 12時間経過または初訪問：RPCでTODAY/TOTALを確実にインクリメント
          const { data, error } = await supabase.rpc("record_site_visit", {
            p_visitor_id: visitorId,
          });

          if (!error && data) {
            const newCounts: VisitCounts = {
              today: Number(data.today) || 1,
              total: Number(data.total) || 1,
            };
            if (isMounted) {
              setCounts(newCounts);
              setLoaded(true);
            }
            try {
              localStorage.setItem(STORAGE_LAST_COUNT_KEY, now.toString());
              localStorage.setItem(STORAGE_CACHED_COUNTS_KEY, JSON.stringify(newCounts));
            } catch {
              // ignore
            }
            return;
          }
        }

        // 12時間以内、またはインクリメント不要時は最新のカウントのみ取得
        const { data, error } = await supabase.rpc("get_site_visit_counts");
        if (!error && data) {
          const fetchedCounts: VisitCounts = {
            today: Math.max(1, Number(data.today) || 1),
            total: Math.max(1, Number(data.total) || 1),
          };
          if (isMounted) {
            setCounts(fetchedCounts);
            setLoaded(true);
          }
          try {
            localStorage.setItem(STORAGE_CACHED_COUNTS_KEY, JSON.stringify(fetchedCounts));
          } catch {
            // ignore
          }
          return;
        }

        // RPC未定義時のフォールバック直接クエリ
        const [todayRes, totalRes] = await Promise.all([
          supabase.from("site_daily_visits").select("count").limit(1).maybeSingle(),
          supabase.from("site_analytics_summary").select("value").eq("key", "total_visits").maybeSingle(),
        ]);

        if (isMounted) {
          const fallbackToday = Math.max(1, Number(todayRes.data?.count) || 1);
          const fallbackTotal = Math.max(1, Number(totalRes.data?.value) || 1);
          setCounts({ today: fallbackToday, total: fallbackTotal });
          setLoaded(true);
        }
      } catch (err) {
        console.warn("Visitor counter fetch failed, using fallback:", err);
        if (isMounted) setLoaded(true);
      }
    }

    handleVisit();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      title="同一訪問者は12時間ごとに1回カウントされます（日本時間0時TODAYリセット）"
      className="inline-flex items-center gap-2.5 bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm px-4 sm:px-5 py-2 sm:py-2.5 rounded-full hover:shadow-md hover:border-slate-300 transition-all cursor-default select-none group"
    >
      {/* 稼働中インジケーター（エメラルドグリーンのパルスアニメーション） */}
      <span className="flex h-2.5 w-2.5 relative">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>

      <span className="text-xs sm:text-sm font-semibold text-slate-500">訪問者数</span>

      <div className="flex items-center gap-2 text-xs sm:text-sm">
        <span className="font-bold text-slate-500">
          TODAY:{" "}
          <span className="font-black text-emerald-600 text-sm sm:text-base ml-0.5 tracking-tight">
            {loaded ? counts.today.toLocaleString() : "--"}
          </span>
        </span>
        <span className="text-slate-300">/</span>
        <span className="font-bold text-slate-500">
          TOTAL:{" "}
          <span className="font-black text-slate-900 text-sm sm:text-base ml-0.5 tracking-tight">
            {loaded ? counts.total.toLocaleString() : "--"}
          </span>
        </span>
      </div>
    </div>
  );
}
