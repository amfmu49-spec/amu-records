"use client";

interface UserRoleBadgeProps {
  role?: string | null;
  size?: "xs" | "sm" | "md";
  theme?: "light" | "dark";
  className?: string;
}

export default function UserRoleBadge({
  role = "creator",
  size = "sm",
  theme = "light",
  className = "",
}: UserRoleBadgeProps) {
  const isListener = role === "listener";

  // サイズバリエーション
  const sizeClasses = {
    xs: "text-[10px] px-2 py-0.2 gap-1",
    sm: "text-[11px] sm:text-xs px-2.5 py-0.5 gap-1.5",
    md: "text-xs sm:text-sm px-3 py-1 gap-1.5",
  }[size];

  // カラーバリエーション（ライト / ダーク）
  const colorClasses = isListener
    ? theme === "dark"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
      : "bg-emerald-50 text-emerald-700 border-emerald-200"
    : theme === "dark"
    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
    : "bg-indigo-50 text-indigo-700 border-indigo-200";

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border shadow-2xs select-none shrink-0 ${sizeClasses} ${colorClasses} ${className}`}
    >
      {isListener ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>リスナー</span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
          <span>クリエイター</span>
        </>
      )}
    </span>
  );
}
