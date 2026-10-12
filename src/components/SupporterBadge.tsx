"use client";

import { SupporterRankType, SUPPORTER_RANKS } from "@/utils/supporterRank";

interface SupporterBadgeProps {
  rank?: SupporterRankType | string | null;
  size?: "xs" | "sm" | "md" | "lg";
  showIconOnly?: boolean;
  className?: string;
}

export default function SupporterBadge({
  rank = "none",
  size = "xs",
  showIconOnly = false,
  className = "",
}: SupporterBadgeProps) {
  const safeRank: SupporterRankType =
    rank === "bronze" || rank === "silver" || rank === "gold" || rank === "platinum"
      ? rank
      : "none";

  if (safeRank === "none") return null;

  const info = SUPPORTER_RANKS[safeRank];

  const sizeClasses = {
    xs: "text-[10px] px-1.5 py-0.5 gap-1",
    sm: "text-xs px-2 py-0.5 gap-1.5",
    md: "text-sm px-2.5 py-1 gap-1.5",
    lg: "text-base px-3 py-1.5 gap-2",
  }[size];

  // ランクごとのリッチなスタイル定義
  const rankStyles: Record<
    SupporterRankType,
    { badgeBg: string; border: string; text: string; shadow: string }
  > = {
    none: {
      badgeBg: "bg-slate-100",
      border: "border-slate-200",
      text: "text-slate-600",
      shadow: "",
    },
    bronze: {
      badgeBg: "bg-gradient-to-r from-amber-950/10 via-amber-900/15 to-orange-950/10",
      border: "border-[#CD7F32]/50",
      text: "text-[#8a4a16]",
      shadow: "shadow-2xs",
    },
    silver: {
      badgeBg: "bg-gradient-to-r from-slate-100 via-slate-200/80 to-slate-100",
      border: "border-slate-300",
      text: "text-slate-700",
      shadow: "shadow-2xs",
    },
    gold: {
      badgeBg: "bg-gradient-to-r from-amber-100/90 via-yellow-100 to-amber-100/90",
      border: "border-amber-400/80",
      text: "text-amber-800 font-bold",
      shadow: "shadow-2xs shadow-amber-300/30",
    },
    platinum: {
      badgeBg: "bg-gradient-to-r from-cyan-100/80 via-indigo-100/80 to-sky-100/80",
      border: "border-cyan-400/90",
      text: "text-cyan-900 font-black",
      shadow: "shadow-xs shadow-cyan-400/30",
    },
  };

  const style = rankStyles[safeRank];

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border transition-transform select-none ${style.badgeBg} ${style.border} ${style.text} ${style.shadow} ${sizeClasses} ${className}`}
      title={`${info.nameJa}（${info.name} Supporter）`}
    >
      <span className="leading-none">{info.icon}</span>
      {!showIconOnly && (
        <span className="tracking-tight whitespace-nowrap">{info.nameJa}</span>
      )}
    </span>
  );
}
