/**
 * ランキング計算ユーティリティ
 * 
 * ルール:
 * - 再生: 1P (不正防止のため何度再生しても1Pのみ)
 * - いいね: 2P (不正防止のため1曲につき1ユーザー1回のみ。消して付け直してもユニーク1回)
 * - コメント: 3P (不正防止のため前後の空白を除いて3文字以上の有効コメントのみカウント)
 */

export interface RankingBreakdown {
  total: number;
  play: number;
  like: number;
  comment: number;
  likeCount: number;
  commentCount: number;
}

export interface RankedSong {
  [key: string]: any;
  rankingScore: number;
  rankingBreakdown: RankingBreakdown;
}

/**
 * 日本時間(JST)の直近月曜日 00:00:00 の日時を取得
 */
export function getThisWeekMondayJST(): Date {
  const now = new Date();
  // JSTオフセット (+9時間)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jstNow = new Date(utc + 9 * 3600000);

  const day = jstNow.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const mondayJST = new Date(jstNow);
  mondayJST.setDate(jstNow.getDate() + diffToMonday);
  mondayJST.setHours(0, 0, 0, 0);

  // UTC Dateオブジェクトへ変換して戻す
  const mondayUtcTime = mondayJST.getTime() - 9 * 3600000;
  return new Date(mondayUtcTime);
}

/**
 * 楽曲リストに対してランキングスコアを計算し、降順でソートして返す
 * @param songs 楽曲オブジェクトのリスト (likes, amu_commentsリレーション含む)
 * @param sinceDate 集計開始日時 (null の場合は累計・全期間)
 */
export function calculateRankedSongs(songs: any[], sinceDate: Date | null): RankedSong[] {
  if (!songs || songs.length === 0) return [];

  const scored: RankedSong[] = songs.map((song) => {
    // 1. 再生スコア: 再生実績があれば 1P (何度再生しても上限1P)
    const playScore = (song.play_count && song.play_count > 0) ? 1 : 0;

    // 2. いいねスコア: ユニークユーザー数 × 2P
    const rawLikes = song.likes || [];
    const validLikes = sinceDate
      ? rawLikes.filter((l: any) => new Date(l.created_at) >= sinceDate)
      : rawLikes;
    const uniqueLikeUsers = new Set(validLikes.map((l: any) => l.user_id));
    const likeCount = uniqueLikeUsers.size;
    const likeScore = likeCount * 2;

    // 3. コメントスコア: 3文字以上の有効コメント × 3P (重複荒らし防止のためユニークユーザーまたは3文字以上のコメント)
    const rawComments = song.amu_comments || [];
    const validComments = rawComments.filter((c: any) => {
      if (!c.content) return false;
      const text = c.content.trim();
      if (text.length < 3) return false; // 3文字以上のみ対象
      if (sinceDate && new Date(c.created_at) < sinceDate) return false;
      return true;
    });

    const validCommentCount = validComments.length;
    const commentScore = validCommentCount * 3;

    const total = playScore + likeScore + commentScore;

    return {
      ...song,
      rankingScore: total,
      rankingBreakdown: {
        total,
        play: playScore,
        like: likeScore,
        comment: commentScore,
        likeCount,
        commentCount: validCommentCount,
      },
    };
  });

  // スコア順にソート（同点時のタイブレーク: いいねスコア → 再生回数 → 新着順）
  scored.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) {
      return b.rankingScore - a.rankingScore;
    }
    if (b.rankingBreakdown.like !== a.rankingBreakdown.like) {
      return b.rankingBreakdown.like - a.rankingBreakdown.like;
    }
    if ((b.play_count || 0) !== (a.play_count || 0)) {
      return (b.play_count || 0) - (a.play_count || 0);
    }
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return scored;
}
