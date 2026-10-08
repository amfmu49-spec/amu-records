import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { connection } from "next/server";
import AuthButton from "@/components/AuthButton";
import SongDetailHero from "@/components/SongDetailHero";
import CommentSection from "@/components/CommentSection";
import TrackList from "@/components/TrackList";

interface SongPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: SongPageProps): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const supabase = await createClient();

  const { data: song } = await supabase
    .from("songs")
    .select("*, profiles(*)")
    .eq("id", id)
    .single();

  if (!song) {
    return {
      title: "曲が見つかりません | AMU RECORDS",
    };
  }

  const artistName = song.profiles?.artist_name || song.artist || "Unknown Artist";
  const title = `${song.title} - ${artistName} | AMU RECORDS`;
  const description =
    song.description ||
    `${artistName}の楽曲「${song.title}」。AMU RECORDSで今すぐ高音質ストリーミング再生。`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: song.cover_url ? [song.cover_url] : ["/logo.png"],
      type: "music.song",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: song.cover_url ? [song.cover_url] : ["/logo.png"],
    },
  };
}

export default async function SongPage({ params }: SongPageProps) {
  await connection();
  const { id } = await params;
  const supabase = await createClient();

  // 楽曲情報の取得
  const { data: song } = await supabase
    .from("songs")
    .select("*, profiles(*), likes(user_id), amu_comments(id)")
    .eq("id", id)
    .single();

  if (!song) {
    notFound();
  }

  // ログイン中のユーザー情報を取得
  const { data: { user } } = await supabase.auth.getUser();

  const isLiked = song.likes?.some((l: any) => l.user_id === user?.id) || false;
  const likeCount = song.likes?.length || 0;
  const commentCount = song.amu_comments?.length || 0;

  // このアーティストの他の楽曲
  const { data: artistSongs } = await supabase
    .from("songs")
    .select("*, profiles(*), likes(user_id), amu_comments(id)")
    .eq("user_id", song.user_id)
    .neq("id", song.id)
    .order("created_at", { ascending: false })
    .limit(4);

  // もし他楽曲がなければ人気のトラックを表示
  let fallbackSongs: any[] = [];
  if (!artistSongs || artistSongs.length === 0) {
    const { data: popular } = await supabase
      .from("songs")
      .select("*, profiles(*), likes(user_id), amu_comments(id)")
      .neq("id", song.id)
      .order("play_count", { ascending: false })
      .limit(4);
    fallbackSongs = popular || [];
  }

  const relatedSongs = artistSongs && artistSongs.length > 0 ? artistSongs : fallbackSongs;
  const relatedTitle =
    artistSongs && artistSongs.length > 0
      ? `${song.profiles?.artist_name || "このアーティスト"}の他の楽曲`
      : "人気の他の楽曲";

  return (
    <main className="min-h-screen bg-slate-50/50 text-slate-900 pb-32 font-sans">
      {/* グローバルヘッダー */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 sm:px-6 py-2 sm:py-3 md:py-3.5 flex justify-between items-center shadow-sm">
        <div className="flex items-center shrink">
          <Link href="/" className="relative z-20 block shrink">
            <img
              src="/logo.png"
              alt="AMU RECORDS"
              className="h-16 sm:h-24 md:h-32 w-auto max-w-[240px] sm:max-w-none object-contain cursor-pointer hover:opacity-80 transition-opacity"
            />
          </Link>
        </div>
        <div className="shrink-0 relative z-20 pl-2">
          <AuthButton user={user} />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* ナビゲーション */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 active:scale-95 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            トップページに戻る
          </Link>
        </div>

        {/* 楽曲メインヒーロー */}
        <SongDetailHero
          song={song}
          initialIsLiked={isLiked}
          likeCount={likeCount}
          currentUserId={user?.id}
          commentCount={commentCount}
        />

        {/* コメントセクション */}
        <div className="bg-white rounded-[2rem] border border-slate-200 p-6 sm:p-10 shadow-sm mb-12">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </span>
              コメント・応援メッセージ
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                {commentCount}件
              </span>
            </h2>
          </div>

          <CommentSection songId={song.id} currentUserId={user?.id} />
        </div>

        {/* 関連楽曲 */}
        {relatedSongs && relatedSongs.length > 0 && (
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-3 text-slate-800 tracking-tight">
                <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </span>
                {relatedTitle}
              </h2>
            </div>

            <TrackList songs={relatedSongs} currentUserId={user?.id} />
          </div>
        )}
      </div>
    </main>
  );
}
