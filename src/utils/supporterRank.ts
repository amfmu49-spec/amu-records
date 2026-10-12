export type SupporterRankType = "none" | "bronze" | "silver" | "gold" | "platinum";

export interface SupporterRankInfo {
  rank: SupporterRankType;
  name: string;
  nameJa: string;
  icon: string;
  heartColor: string; // Tailwindクラス名
  heartHex: string;   // HEXカラーコード
  badgeClass: string;
  totalLikes: number;
  monthlyLikes: number;
  nextRank: SupporterRankType | null;
  nextRankNameJa: string | null;
  nextRankThreshold: number | null;
  likesToNextRank: number;
  maintainCondition: number;
  likesToMaintain: number;
  isMaintained: boolean;
}

export const SUPPORTER_RANKS: Record<
  SupporterRankType,
  {
    name: string;
    nameJa: string;
    icon: string;
    heartColor: string;
    heartHex: string;
    badgeClass: string;
    promoteThreshold: number; // 初回/昇格累計条件
    maintainCondition: number; // 翌月継続に必要な当月いいね数
  }
> = {
  none: {
    name: "Regular",
    nameJa: "レギュラー",
    icon: "🤍",
    heartColor: "text-rose-500 fill-rose-500",
    heartHex: "#ef4444",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    promoteThreshold: 0,
    maintainCondition: 0,
  },
  bronze: {
    name: "Bronze",
    nameJa: "ブロンズサポーター",
    icon: "🥉",
    heartColor: "text-[#CD7F32] fill-[#CD7F32]",
    heartHex: "#CD7F32",
    badgeClass: "bg-amber-900/10 text-amber-900 border-amber-800/30",
    promoteThreshold: 5,
    maintainCondition: 3,
  },
  silver: {
    name: "Silver",
    nameJa: "シルバーサポーター",
    icon: "🥈",
    heartColor: "text-slate-400 fill-slate-400",
    heartHex: "#94a3b8",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    promoteThreshold: 15,
    maintainCondition: 8,
  },
  gold: {
    name: "Gold",
    nameJa: "ゴールドサポーター",
    icon: "🥇",
    heartColor: "text-amber-500 fill-amber-500",
    heartHex: "#f59e0b",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-300 shadow-2xs font-bold",
    promoteThreshold: 30,
    maintainCondition: 15,
  },
  platinum: {
    name: "Platinum",
    nameJa: "プラチナサポーター",
    icon: "💎",
    heartColor: "text-cyan-500 fill-cyan-500",
    heartHex: "#06b6d4",
    badgeClass: "bg-gradient-to-r from-cyan-50 to-indigo-50 text-cyan-800 border-cyan-300/80 shadow-xs font-black",
    promoteThreshold: 50,
    maintainCondition: 25,
  },
};

/**
 * 過去のいいねレコード配列から、現在のサポーターランクと進捗状況を精密に算出する
 */
export function calculateSupporterRank(
  likes: { created_at?: string }[] = []
): SupporterRankInfo {
  const totalLikes = likes.length;

  // JSTでの当月キー ("YYYY-MM") を取得
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // 当月のいいね数を集計
  let monthlyLikes = 0;
  // 月ごとのいいね数を集計 ("YYYY-MM" -> count)
  const monthCountMap = new Map<string, number>();

  likes.forEach((item) => {
    if (!item.created_at) return;
    const d = new Date(item.created_at);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthCountMap.set(mKey, (monthCountMap.get(mKey) || 0) + 1);

    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      monthlyLikes++;
    }
  });

  // 月を昇順ソートして過去からのランク推移をシミュレーション
  const sortedMonths = Array.from(monthCountMap.keys()).sort();
  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  let runningRank: SupporterRankType = "none";
  let cumulativeCount = 0;

  // 累計いいね数から即座に達成できる最高ランクを判定するヘルパー
  const getRankFromTotal = (total: number): SupporterRankType => {
    if (total >= 50) return "platinum";
    if (total >= 30) return "gold";
    if (total >= 15) return "silver";
    if (total >= 5) return "bronze";
    return "none";
  };

  // 過去月がある場合、月次推移を計算
  for (const mKey of sortedMonths) {
    const mCount = monthCountMap.get(mKey) || 0;
    cumulativeCount += mCount;

    if (mKey === currentMonthKey) {
      // 当月：前月ランクを維持しているか、または当月累計でさらに昇格したかを判定
      const rankFromCumulative = getRankFromTotal(cumulativeCount);
      // 累計による即時昇格があればそれを採用
      if (
        getRankWeight(rankFromCumulative) > getRankWeight(runningRank)
      ) {
        runningRank = rankFromCumulative;
      }
      break;
    }

    // 過去月の更新：
    // その月で累計による昇格判定
    const rankFromCum = getRankFromTotal(cumulativeCount);
    if (getRankWeight(rankFromCum) > getRankWeight(runningRank)) {
      runningRank = rankFromCum;
    } else {
      // 翌月への継続条件判定（満たさなければランクダウン）
      // ランクごとの維持条件
      if (runningRank === "platinum" && mCount < 25) {
        runningRank = mCount >= 15 ? "gold" : mCount >= 8 ? "silver" : mCount >= 3 ? "bronze" : "none";
      } else if (runningRank === "gold" && mCount < 15) {
        runningRank = mCount >= 8 ? "silver" : mCount >= 3 ? "bronze" : "none";
      } else if (runningRank === "silver" && mCount < 8) {
        runningRank = mCount >= 3 ? "bronze" : "none";
      } else if (runningRank === "bronze" && mCount < 3) {
        runningRank = "none";
      }
    }
  }

  // もし月次シミュレーション後でも、現時点の累計いいね数で昇格できる場合は即時反映
  const rankByTotal = getRankFromTotal(totalLikes);
  if (getRankWeight(rankByTotal) > getRankWeight(runningRank)) {
    runningRank = rankByTotal;
  }

  // 現在のランク情報
  const currentRankConfig = SUPPORTER_RANKS[runningRank];

  // 次のランク情報
  let nextRank: SupporterRankType | null = null;
  let nextRankThreshold: number | null = null;
  if (runningRank === "none") {
    nextRank = "bronze";
    nextRankThreshold = 5;
  } else if (runningRank === "bronze") {
    nextRank = "silver";
    nextRankThreshold = 15;
  } else if (runningRank === "silver") {
    nextRank = "gold";
    nextRankThreshold = 30;
  } else if (runningRank === "gold") {
    nextRank = "platinum";
    nextRankThreshold = 50;
  } else {
    nextRank = null;
    nextRankThreshold = null;
  }

  const likesToNextRank = nextRankThreshold
    ? Math.max(0, nextRankThreshold - totalLikes)
    : 0;

  const maintainCondition = currentRankConfig.maintainCondition;
  const isMaintained = maintainCondition > 0 ? monthlyLikes >= maintainCondition : true;
  const likesToMaintain = maintainCondition > 0
    ? Math.max(0, maintainCondition - monthlyLikes)
    : 0;

  return {
    rank: runningRank,
    name: currentRankConfig.name,
    nameJa: currentRankConfig.nameJa,
    icon: currentRankConfig.icon,
    heartColor: currentRankConfig.heartColor,
    heartHex: currentRankConfig.heartHex,
    badgeClass: currentRankConfig.badgeClass,
    totalLikes,
    monthlyLikes,
    nextRank,
    nextRankNameJa: nextRank ? SUPPORTER_RANKS[nextRank].nameJa : null,
    nextRankThreshold,
    likesToNextRank,
    maintainCondition,
    likesToMaintain,
    isMaintained,
  };
}

function getRankWeight(rank: SupporterRankType): number {
  switch (rank) {
    case "platinum":
      return 4;
    case "gold":
      return 3;
    case "silver":
      return 2;
    case "bronze":
      return 1;
    default:
      return 0;
  }
}
