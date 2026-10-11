export interface LyricLine {
  id: number;
  time: number; // 秒数
  text: string;
}

/**
 * タイムスタンプ文字列（mm:ss, mm:ss.xx, hh:mm:ss など）を秒数に変換
 */
export function parseTimestampToSeconds(timeStr: string): number | null {
  const parts = timeStr.trim().split(":");
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    if (!isNaN(minutes) && !isNaN(seconds)) {
      return minutes * 60 + seconds;
    }
  } else if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
      return hours * 3600 + minutes * 60 + seconds;
    }
  }
  return null;
}

/**
 * 秒数を [mm:ss.xx] 形式のタイムタグに変換
 */
export function formatSecondsToTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "[00:00.00]";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}]`;
}

/**
 * LRC形式テキストをパースしてソート済みのLyricLine配列を生成
 */
export function parseLrc(lrcText: string | null | undefined): LyricLine[] {
  if (!lrcText || typeof lrcText !== "string") return [];

  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];
  let counter = 0;

  // [00:12.34] または [00:12] を検出する正規表現
  const timeRegex = /\[(\d{1,2}:\d{1,2}(?:\.\d{1,3})?)\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // メタデータタグ（[ti:Title], [ar:Artist] など）はスキップ
    if (/^\[[a-zA-Z]+:/.test(trimmed)) continue;

    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length > 0) {
      // タイムスタンプ部分を取り除いた本文
      const text = trimmed.replace(timeRegex, "").trim();
      for (const match of matches) {
        const timeStr = match[1];
        const seconds = parseTimestampToSeconds(timeStr);
        if (seconds !== null) {
          result.push({
            id: counter++,
            time: seconds,
            text: text || "…", // 空行の場合は三点リーダー
          });
        }
      }
    } else {
      // タイムスタンプがない普通の行の場合（手動入力中など）
      // 直前の行に足すか、タイムスタンプなしとして扱う
      // 行頭に "00:15 歌詞" のような形式もあるかチェック
      const spaceMatch = trimmed.match(/^(\d{1,2}:\d{1,2}(?:\.\d{1,3})?)\s+(.*)$/);
      if (spaceMatch) {
        const seconds = parseTimestampToSeconds(spaceMatch[1]);
        if (seconds !== null) {
          result.push({
            id: counter++,
            time: seconds,
            text: spaceMatch[2].trim() || "…",
          });
        }
      }
    }
  }

  // 時間順にソート
  return result.sort((a, b) => a.time - b.time);
}

/**
 * 現在の再生時間（currentTime）に該当するアクティブな歌詞行のインデックスを特定
 */
export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (!lyrics || lyrics.length === 0) return -1;
  if (currentTime < lyrics[0].time) return -1;

  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) {
      return i;
    }
  }
  return 0;
}
