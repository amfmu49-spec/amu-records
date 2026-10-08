import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import TrackList from "@/components/TrackList";
import RandomPlayButton from "@/components/RandomPlayButton";
import AuthButton from "@/components/AuthButton";
import { connection } from "next/server";

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const supabase = await createClient();
  const { id } = await params;
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!profile) {
    notFound();
  }

  // 本人が投稿した曲、またはコラボアーティストとして参加した曲をすべて取得
  const { data: songs } = await supabase
    .from("songs")
    .select("*, profiles:profiles!fk_user_profile(*), co_artist_1:profiles!songs_co_artist_id_1_fkey(*), co_artist_2:profiles!songs_co_artist_id_2_fkey(*), likes(user_id), amu_comments(id)")
    .or(`user_id.eq.${id},co_artist_id_1.eq.${id},co_artist_id_2.eq.${id}`)
    .order("created_at", { ascending: false });
    
  // ログイン中のユーザー情報を取得
  const { data: { user } } = await supabase.auth.getUser();

  // 安全なhttps URLかチェックする関数
  const isSafeHttpsUrl = (urlString?: string | null) => {
    if (!urlString) return false;
    try {
      const url = new URL(urlString);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  };

  const isSafeYouTubeEmbed = (urlString?: string | null) => {
    if (!urlString) return false;
    try {
      const url = new URL(urlString);
      return url.protocol === "https:" && (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") && url.pathname.startsWith("/embed/");
    } catch {
      return false;
    }
  };

  const safeTiktok = isSafeHttpsUrl(profile.tiktok_url) ? profile.tiktok_url : null;
  const safeYoutube = isSafeHttpsUrl(profile.youtube_url) ? profile.youtube_url : null;
  const safeSuno = isSafeHttpsUrl(profile.suno_url) ? profile.suno_url : null;
  const safeYoutubeEmbed = isSafeYouTubeEmbed(profile.youtube_embed_url) ? profile.youtube_embed_url : null;

  return (
    <main className="min-h-screen bg-slate-50/50 text-slate-900 pb-32 font-sans">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 sm:px-6 py-2 sm:py-3 md:py-3.5 flex justify-between items-center shadow-sm">
        <div className="flex items-center shrink">
          <Link href="/" className="relative z-20 block shrink">
            <img src="/logo.png" alt="AMU RECORDS" className="h-16 sm:h-24 md:h-32 w-auto max-w-[240px] sm:max-w-none object-contain cursor-pointer hover:opacity-80 transition-opacity" />
          </Link>
        </div>
        <div className="shrink-0 relative z-20 pl-2">
          <AuthButton user={user} />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 sm:p-12 shadow-sm mb-12 flex flex-col sm:flex-row items-center gap-8 relative overflow-hidden">
          <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-xl shrink-0 z-10">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.artist_name} className="w-full h-full object-cover" />
            ) : (
              <svg className="w-full h-full p-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            )}
          </div>

          <div className="flex-1 text-center sm:text-left z-10">
            <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">{profile.artist_name}</h2>
            
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-6">
              {safeTiktok && (
                <a href={safeTiktok} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-bold shadow-md hover:-translate-y-0.5 transition-transform flex items-center gap-2">
                  TikTok
                </a>
              )}
              {safeYoutube && (
                <a href={safeYoutube} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-red-600 text-white rounded-full text-sm font-bold shadow-md hover:-translate-y-0.5 transition-transform flex items-center gap-2">
                  YouTube
                </a>
              )}
              {safeSuno && (
                <a href={safeSuno} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-purple-600 text-white rounded-full text-sm font-bold shadow-md hover:-translate-y-0.5 transition-transform flex items-center gap-2">
                  SUNO
                </a>
              )}
              {!safeTiktok && !safeYoutube && !safeSuno && (
                <span className="text-slate-400 text-sm">リンクは設定されていません</span>
              )}
            </div>

            <RandomPlayButton songs={songs || []} />
          </div>
        </div>

        {/* 埋め込み動画セクション */}
        {(safeYoutubeEmbed || profile.tiktok_embed_url) && (
          <div className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-6">
            {safeYoutubeEmbed && (
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                  YouTube
                </h3>
                <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-100">
                  <iframe width="100%" height="100%" src={safeYoutubeEmbed} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                </div>
              </div>
            )}
            
            {profile.tiktok_embed_url && profile.tiktok_embed_url.includes('/video/') && (
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v7.2c0 1.96-.5 3.96-1.7 5.47-1.18 1.49-2.92 2.4-4.82 2.53-2.06.15-4.14-.38-5.74-1.65-1.55-1.22-2.5-3.08-2.6-5.06-.06-1.77.42-3.56 1.44-4.99 1.1-1.53 2.74-2.52 4.57-2.85 1.56-.28 3.16-.13 4.63.48v4.25c-1.12-.46-2.45-.58-3.64-.13-.97.38-1.77 1.19-2.07 2.18-.3.99-.17 2.1.37 2.96.53.84 1.48 1.34 2.46 1.41 1.25.1 2.5-.32 3.32-1.21.84-.91 1.21-2.14 1.21-3.37V.02z"/></svg>
                  TikTok
                </h3>
                <div className="aspect-[9/16] w-full max-w-[300px] mx-auto rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
                   <iframe src={`https://www.tiktok.com/embed/v2/${encodeURIComponent(profile.tiktok_embed_url.split('/video/')[1].split('?')[0])}`} width="100%" height="100%" frameBorder="0" allowFullScreen></iframe>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <h3 className="text-2xl font-bold mb-6 text-slate-800 tracking-tight flex items-center gap-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
            Tracks
          </h3>

          <TrackList songs={songs || []} currentUserId={user?.id} />
        </div>
      </div>
    </main>
  );
}
