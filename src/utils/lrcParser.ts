export interface LyricLine {
  id: number;
  time: number; // 秒数
  text: string;
}

/**
 * タイムスタンプ文字列（mm:ss, mm:ss.xx, hh:mm:ss など）を秒数に変換
 */
export function parseTimestampToSeconds(timeStr: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim().replace(/[,]/g, ".");
  const parts = cleaned.split(":");

  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    if (!isNaN(minutes) && !isNaN(seconds)) {
      return Math.max(0, minutes * 60 + seconds);
    }
  } else if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
      return Math.max(0, hours * 3600 + minutes * 60 + seconds);
    }
  }
  return null;
}

/**
 * 秒数を mm:ss 形式に整形（表示用）
 */
export function formatSecondsToTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * LRC / SRT / プレーンテキストなど、あらゆる形式の歌詞テキストを柔軟にパース
 * どんな歌詞でも必ず全行が表示される堅牢設計
 */
export function parseLrc(rawText: string | null | undefined): LyricLine[] {
  if (!rawText || typeof rawText !== "string") return [];

  let text = rawText.replace(/\r/g, "").trim();
  if (!text) return [];

  // 1. SRT形式 (00:01:23,456 --> 00:01:26,789) の自動変換
  if (text.includes("-->")) {
    const srtBlocks = text.split(/\n\s*\n/);
    const convertedLines: string[] = [];
    for (const block of srtBlocks) {
      const bLines = block.trim().split("\n");
      if (bLines.length >= 2) {
        // タイムスタンプ行を探す
        const timeLine = bLines.find((l) => l.includes("-->"));
        if (timeLine) {
          const match = timeLine.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
          if (match) {
            const min = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
            const sec = match[3];
            const ms = match[4].slice(0, 2);
            // 本文行を結合
            const textLines = bLines.filter((l) => !l.includes("-->") && !/^\d+$/.test(l.trim()));
            convertedLines.push(`[${String(min).padStart(2, "0")}:${sec}.${ms}] ${textLines.join(" ")}`);
          }
        }
      }
    }
    if (convertedLines.length > 0) {
      text = convertedLines.join("\n");
    }
  }

  // 2. 全角括弧や全角コロンを半角に正規化
  const normalized = text
    .replace(/[【［（]/g, "[")
    .replace(/[】］）]/g, "]")
    .replace(/：/g, ":");

  const lines = normalized.split("\n");
  const result: LyricLine[] = [];
  let counter = 0;

  // [00:12.34], [00:12], [0:12], [01:23:45] などを幅広く検出
  const timeRegex = /\[(\d{1,2}:\d{1,2}(?::\d{1,2})?(?:[.:]\d{1,3})?)\]/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // メタデータタグ（[ti:Title], [ar:Artist] など）は除外
    if (/^\[[a-zA-Z]+:/.test(line)) continue;

    const matches = Array.from(line.matchAll(timeRegex));
    if (matches.length > 0) {
      const lyricText = line.replace(timeRegex, "").trim();
      for (const match of matches) {
        const seconds = parseTimestampToSeconds(match[1]);
        if (seconds !== null) {
          result.push({
            id: counter++,
            time: seconds,
            text: lyricText || "…",
          });
        }
      }
    } else {
      // 行頭に "00:15 歌詞" のようなスペース区切り形式があるか確認
      const leadMatch = line.match(/^(\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?)\s+(.*)$/);
      if (leadMatch) {
        const seconds = parseTimestampToSeconds(leadMatch[1]);
        if (seconds !== null) {
          result.push({
            id: counter++,
            time: seconds,
            text: leadMatch[2].trim() || "…",
          });
        }
      }
    }
  }

  // 3. もしタイムスタンプが1つも検出できなかった場合（通常の歌詞テキストの場合）
  // 空白で落ちることなく、各行に3.5秒ごとの仮時間を自動設定して全行を確実に表示！
  if (result.length === 0) {
    const rawLines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    rawLines.forEach((l, index) => {
      result.push({
        id: counter++,
        time: index * 3.5, // 3.5秒刻み
        text: l,
      });
    });
  }

  // 時間順にソートして返却
  return result.sort((a, b) => a.time - b.time);
}

/**
 * 現在の再生時間（currentTime）に該当するアクティブな歌詞行のインデックスを特定
 */
export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (!lyrics || lyrics.length === 0) return -1;
  if (currentTime < lyrics[0].time) return 0; // 開始前は先頭行

  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) {
      return i;
    }
  }
  return 0;
}
