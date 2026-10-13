import { createClient } from "@/utils/supabase/server";
import AuthButton from "@/components/AuthButton";
import Link from "next/link";
import TrackList from "@/components/TrackList";
import RandomPlayButton from "@/components/RandomPlayButton";
import HeroPlayer from "@/components/HeroPlayer";
import CommunityStatsBar from "@/components/CommunityStatsBar";
import SongSearchSection from "@/components/SongSearchSection";
import CommunityBoard from "@/components/CommunityBoard";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import FeaturedPlaylistsSection from "@/components/FeaturedPlaylistsSection";
import VisitorCounter from "@/components/VisitorCounter";
import RecentCommentsTicker, { CommentTickerItem } from "@/components/RecentCommentsTicker";
import RankedTracksSection from "@/components/RankedTracksSection";
import { calculateRankedSongs, getThisWeekMondayJST } from "@/utils/ranking";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 並列で統計カウント、アーティスト一覧、楽曲データ、公開プレイリスト、最新コメントを取得
  const [
    { count: songCount },
    { data: profiles },
    { data: songs },
    { data: publicPlaylists },
    { data: latestComments },
    { data: latestLikes }
  ] = await Promise.all([
    supabase.from("songs").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    // 全楽曲およびリレーション（いいね・コメントの日時・内容・ユーザーID含む）を一括取得
    supabase.from("songs").select("*, profiles:profiles!fk_user_profile(*), co_artist_1:profiles!songs_co_artist_id_1_fkey(*), co_artist_2:profiles!songs_co_artist_id_2_fkey(*), likes(id, user_id, created_at), amu_comments(id, user_id, content, created_at)").order("created_at", { ascending: false }),
    supabase.from("playlists").select("id, title, description, created_at, profiles:profiles!fk_playlist_profile(id, artist_name, avatar_url, role), playlist_songs(id, song_id, songs:songs!fk_playlist_song(cover_url))").eq("is_public", true).order("created_at", { ascending: false }).limit(6),
    supabase.from("amu_comments").select("id, song_id, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("likes").select("id, song_id, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  // アーティストごとの参加曲数を集計（単独＋コラボ参加含む）
  const songCountByArtist = new Map<string, number>();
  songs?.forEach((song) => {
    if (song.user_id) {
      songCountByArtist.set(song.user_id, (songCountByArtist.get(song.user_id) || 0) + 1);
    }
    if (song.co_artist_id_1) {
      songCountByArtist.set(song.co_artist_id_1, (songCountByArtist.get(song.co_artist_id_1) || 0) + 1);
    }
    if (song.co_artist_id_2) {
      songCountByArtist.set(song.co_artist_id_2, (songCountByArtist.get(song.co_artist_id_2) || 0) + 1);
    }
  });

  // リスナーを除外したクリエイター一覧（リスナーは参加クリエイター数・一覧に含めない）
  const creators = (profiles || []).filter((p) => p.role !== "listener");

  const formattedCreators = creators.map((p) => ({
    id: p.id,
    artist_name: p.artist_name || "Unknown Creator",
    avatar_url: p.avatar_url,
    song_count: songCountByArtist.get(p.id) || 0,
  })).sort((a, b) => b.song_count - a.song_count);

  // 最新アクティビティ一覧の整形（コメント＆いいねを新着順で直近5件に絞る）
  const songMap = new Map<string, { title: string; artist_name: string }>();
  songs?.forEach((s: any) => {
    songMap.set(s.id, {
      title: s.title || "楽曲",
      artist_name: s.artist || s.profiles?.artist_name || "クリエイター",
    });
  });

  const recentActivities: CommentTickerItem[] = [];
  (latestComments || []).forEach((c: any) => {
    const song = songMap.get(c.song_id);
    if (song) {
      recentActivities.push({
        id: c.id,
        type: "comment",
        song_id: c.song_id,
        song_title: song.title,
        artist_name: song.artist_name,
        created_at: c.created_at,
      });
    }
  });

  (latestLikes || []).forEach((l: any) => {
    const song = songMap.get(l.song_id);
    if (song) {
      recentActivities.push({
        id: l.id,
        type: "like",
        song_id: l.song_id,
        song_title: song.title,
        artist_name: song.artist_name,
        created_at: l.created_at,
      });
    }
  });

  recentActivities.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const topActivities = recentActivities.slice(0, 5);

  // サーバー側でランダムな1曲を選ぶ
  const randomSong = songs && songs.length > 0 ? songs[Math.floor(Math.random() * songs.length)] : null;

  // ランキングの計算（今週: 月曜0時JST以降、累計: 全期間）
  // ルール: 再生 1P (何度再生しても1P) / いいね 2P (ユニーク1度きり) / コメント 3P (3文字以上)
  const mondayJST = getThisWeekMondayJST();
  const weeklyRankedSongs = calculateRankedSongs(songs || [], mondayJST);
  const allTimeRankedSongs = calculateRankedSongs(songs || [], null);

  return (
    <main className="min-h-screen bg-white text-slate-900 selection:bg-slate-900 selection:text-white pb-32 font-sans">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-2 sm:px-6 py-2 sm:py-3 md:py-3.5 flex justify-between items-center shadow-sm">
        <div className="flex items-center shrink">
          <Link href="/" className="relative z-20 block shrink -ml-1 sm:ml-0">
            <img src="/logo.png" alt="AMU RECORDS" className="h-10 sm:h-24 md:h-32 w-auto max-w-[130px] sm:max-w-none object-contain cursor-pointer hover:opacity-80 transition-opacity" />
          </Link>
        </div>
        <div className="shrink-0 relative z-20">
          <AuthButton user={user} />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* 最新のお知らせバナー（配信されたお知らせがトップ最上部にリアルタイム表示） */}
        <AnnouncementBanner />

        {/* 最新アクティビティスクロールティッカー（訪問者数の上に配置） */}
        <RecentCommentsTicker initialActivities={topActivities} />

        {/* 訪問者数バッジ（TODAY & TOTAL / 検索の上） */}
        <div className="flex justify-center sm:justify-start mb-4 sm:mb-6">
          <VisitorCounter />
        </div>

        {/* 上部検索バー ＆ リアルタイム検索システム */}
        <SongSearchSection songs={songs || []} currentUserId={user?.id}>
          {/* コミュニティ・楽曲統計バッジ & タップで展開される参加クリエイター一覧 */}
          <CommunityStatsBar
            songCount={songCount ?? 0}
            artistCount={creators.length}
            artists={formattedCreators}
          />

          {/* ランダムに選ばれた曲の大型プレイヤー */}
          <HeroPlayer song={randomSong} />

          {/* ライブモード入り口 ＆ ランダム再生バー（最新のトラックの上に配置） */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-slate-900 border border-rose-500/30 shadow-xl relative overflow-hidden group mt-4 sm:mt-6 mb-2">
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 via-pink-600/10 to-purple-600/20 opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none" />
            
            {/* ライブモード専用ステージへ */}
            <Link
              href="/live"
              className="relative z-10 flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full bg-gradient-to-r from-red-600 via-rose-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white font-black text-xs sm:text-sm md:text-base shadow-lg shadow-rose-600/30 transition-all active:scale-95 group/btn cursor-pointer border border-white/20 select-none"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              <span>🏟️ LIVEステージモード</span>
              <span className="hidden sm:inline-flex items-center text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-black/30 font-bold border border-white/20 text-rose-200">
                客席視点・BOOST連打
              </span>
              <svg className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {/* その横に並べるランダム再生 */}
            <div className="relative z-10 flex items-center gap-2">
              <RandomPlayButton songs={songs || []} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-10 sm:gap-16 min-w-0 mt-4 sm:mt-6">
            {/* 1. 最新のトラック（5曲まで表示） */}
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5 sm:gap-3 text-slate-800 tracking-tight">
                  <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </span>
                  最新のトラック
                </h2>
              </div>
              
              <TrackList songs={songs || []} currentUserId={user?.id} limit={5} />
            </div>

            {/* 2. 人気のトラック（ランキングセクション：今週＆累計タブ） */}
            <RankedTracksSection
              weeklySongs={weeklyRankedSongs}
              allTimeSongs={allTimeRankedSongs}
              currentUserId={user?.id}
            />

            {/* 3. みんなのプレイリスト（公開プレイリスト） */}
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-4 sm:mb-8">
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5 sm:gap-3 text-slate-800 tracking-tight">
                  <span className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center border border-purple-100 text-purple-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </span>
                  注目のプレイリスト
                </h2>
                {user && (
                  <Link
                    href="/profile"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                  >
                    <span>プレイリストを作る</span>
                    <span>→</span>
                  </Link>
                )}
              </div>

              <FeaturedPlaylistsSection playlists={publicPlaylists || []} />
            </div>
          </div>
        </SongSearchSection>

        {/* サイト下部コミュニティ掲示板 */}
        <CommunityBoard />
      </div>
    </main>
  );
}
