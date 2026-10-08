"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import UploadForm from "@/components/UploadForm";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [artistName, setArtistName] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [sunoUrl, setSunoUrl] = useState("");
  const [youtubeEmbedUrl, setYoutubeEmbedUrl] = useState("");
  const [tiktokEmbedUrl, setTiktokEmbedUrl] = useState("");
  const [mySongs, setMySongs] = useState<any[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasProfile, setHasProfile] = useState(false);
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        setHasProfile(true);
        setArtistName(profile.artist_name || "");
        setTiktokUrl(profile.tiktok_url || "");
        setYoutubeUrl(profile.youtube_url || "");
        setSunoUrl(profile.suno_url || "");
        setYoutubeEmbedUrl(profile.youtube_embed_url || "");
        setTiktokEmbedUrl(profile.tiktok_embed_url || "");
        if (profile.avatar_url) {
          setAvatarPreview(profile.avatar_url);
        }
      } else {
        // デフォルト名
        setArtistName(user.user_metadata?.full_name || "New Artist");
      }

      // 過去曲の取得
      const { data: songsData } = await supabase
        .from("songs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
        
      if (songsData) {
        setMySongs(songsData);
      }
    }
    loadProfile();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !artistName) return;

    setIsLoading(true);
    setMessage("");

    try {
      let finalAvatarUrl = avatarPreview;

      // アバターのアップロード
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() || 'jpg';
        const uniqueName = `${uuidv4()}.${ext}`;
        const filePath = `${user.id}/${uniqueName}`;
        
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, avatarFile);
        
        if (uploadError) throw new Error("画像のアップロードに失敗しました");

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);
          
        finalAvatarUrl = publicUrl;
      }

      // プロトコル検証（XSS・オープンリダイレクト対策）
      const isValidHttps = (url: string) => {
        if (!url || !url.trim()) return true;
        try {
          const parsed = new URL(url.trim());
          return parsed.protocol === "https:";
        } catch {
          return false;
        }
      };

      if (!isValidHttps(tiktokUrl) || !isValidHttps(youtubeUrl) || !isValidHttps(sunoUrl) || !isValidHttps(youtubeEmbedUrl) || !isValidHttps(tiktokEmbedUrl)) {
        throw new Error("URLはすべて安全な https:// から始まる形式で入力してください");
      }

      // プロフィールの保存（upsert）
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          artist_name: artistName.trim(),
          avatar_url: finalAvatarUrl,
          tiktok_url: tiktokUrl.trim() || null,
          youtube_url: youtubeUrl.trim() || null,
          suno_url: sunoUrl.trim() || null,
          youtube_embed_url: youtubeEmbedUrl.trim() || null,
          tiktok_embed_url: tiktokEmbedUrl.trim() || null,
        });

      if (error) throw error;

      setHasProfile(true);
      setMessage("プロフィールを保存しました！");
      router.refresh();

    } catch (err: any) {
      setMessage(`エラー: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const handleDeleteSong = async (songId: string) => {
    if (!user) return;
    if (!confirm("本当にこの曲を削除しますか？\n(※関連するコメントなどもすべて削除されます)")) return;
    
    // DBから削除 (本人チェック: user_id = user.id)
    const { error } = await supabase.from("songs").delete().eq("id", songId).eq("user_id", user.id);
    if (error) {
      alert("削除に失敗しました: " + error.message);
      return;
    }
    
    // UIを更新
    setMySongs(mySongs.filter(s => s.id !== songId));
    alert("曲を削除しました。");
  };

  const startEditing = (song: any) => {
    setEditingSongId(song.id);
    setEditTitle(song.title);
    setEditDescription(song.description || "");
  };

  const handleUpdateSong = async (songId: string) => {
    if (!user) return;
    if (!editTitle.trim()) {
      alert("タイトルを入力してください。");
      return;
    }

    // 本人の曲のみ更新 (user_id = user.id)
    const { error } = await supabase
      .from("songs")
      .update({ title: editTitle.trim(), description: editDescription.trim() })
      .eq("id", songId)
      .eq("user_id", user.id);

    if (error) {
      alert("更新に失敗しました: " + error.message);
    } else {
      setMySongs(mySongs.map(s => s.id === songId ? { ...s, title: editTitle.trim(), description: editDescription.trim() } : s));
      setEditingSongId(null);
    }
  };

  if (!user) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">読み込み中...</div>;

  return (
    <main className="min-h-screen bg-slate-50/50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center text-slate-500 hover:text-slate-900 mb-8 transition-colors font-medium">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          ホームへ戻る
        </Link>

        <div className="bg-white rounded-[2rem] p-8 sm:p-12 shadow-sm border border-slate-200">
          <h1 className="text-3xl font-black text-slate-900 mb-8">アーティストプロフィール設定</h1>
          
          <form onSubmit={handleSave} className="space-y-8">
            {/* アバター */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-32 h-32 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-lg flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                )}
              </div>
              <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-full text-sm font-semibold transition-colors">
                画像を変更
                <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </label>
            </div>

            {/* アーティスト名 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">アーティスト名 <span className="text-red-500">*</span></label>
              <input type="text" required value={artistName} onChange={e => setArtistName(e.target.value)} className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" />
            </div>

            <hr className="border-slate-100" />
            <h3 className="text-lg font-bold text-slate-800">SNSリンク (任意)</h3>

            {/* TikTok */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">TikTok URL</label>
              <input type="url" value={tiktokUrl} onChange={e => setTiktokUrl(e.target.value)} placeholder="https://tiktok.com/@yourname" className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" />
            </div>

            {/* YouTube */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">YouTube URL</label>
              <input type="url" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/@yourname" className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" />
            </div>

            {/* SUNO */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">SUNO URL</label>
              <input type="url" value={sunoUrl} onChange={e => setSunoUrl(e.target.value)} placeholder="https://suno.com/@yourname" className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" />
            </div>

            <hr className="border-slate-100" />
            <h3 className="text-lg font-bold text-slate-800">動画の埋め込み (各1つまで)</h3>
            <p className="text-xs text-slate-500 mb-4">※ YouTubeは共有ボタンから「埋め込む」を選んで得られるコード内の src="..." のURL部分だけを入力してください。<br/>※ TikTokは動画URLを入力してください。</p>

            {/* YouTube 埋め込み */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">YouTube 埋め込み用URL</label>
              <input type="url" value={youtubeEmbedUrl} onChange={e => setYoutubeEmbedUrl(e.target.value)} placeholder="https://www.youtube.com/embed/..." className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" />
            </div>

            {/* TikTok 埋め込み */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">TikTok 動画URL</label>
              <input type="url" value={tiktokEmbedUrl} onChange={e => setTiktokEmbedUrl(e.target.value)} placeholder="https://www.tiktok.com/@user/video/..." className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" />
            </div>

            <button type="submit" disabled={isLoading} className="w-full py-4 rounded-xl font-bold text-lg text-white bg-slate-900 hover:bg-slate-800 shadow-lg hover:shadow-xl transition-all disabled:bg-slate-300">
              {isLoading ? "保存中..." : "プロフィールを保存"}
            </button>
            
            {message && <p className="text-center font-medium text-green-600">{message}</p>}
          </form>
        </div>

        {/* 楽曲アップロードフォーム (プロフィールが保存されている場合のみ表示) */}
        {hasProfile ? (
          <div className="mt-12">
            <UploadForm 
              userId={user.id} 
              profile={{ artist_name: artistName, avatar_url: avatarPreview }} 
            />
          </div>
        ) : (
          <div className="mt-12 bg-white rounded-[2rem] p-8 text-center border border-slate-200">
            <p className="text-slate-500 font-medium">楽曲をアップロードするには、先にプロフィールを保存してください。</p>
          </div>
        )}

        {/* 過去曲の管理セクション */}
        {hasProfile && mySongs.length > 0 && (
          <div className="mt-12 bg-white rounded-[2rem] p-8 sm:p-12 shadow-sm border border-slate-200">
            <h2 className="text-2xl font-black text-slate-900 mb-6">アップロード済みの曲の管理</h2>
            <div className="space-y-4">
              {mySongs.map(song => (
                <div key={song.id} className="flex flex-col sm:flex-row p-4 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                  {editingSongId === song.id ? (
                    <div className="flex-1 space-y-3 w-full">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">タイトル</label>
                        <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">概要・キャプション</label>
                        <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-20 resize-none" />
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <button onClick={() => handleUpdateSong(song.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors">
                          保存
                        </button>
                        <button onClick={() => setEditingSongId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate">{song.title}</p>
                        {song.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{song.description}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-2">{new Date(song.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-start gap-2 shrink-0">
                        <button 
                          onClick={() => startEditing(song)}
                          className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
                        >
                          編集
                        </button>
                        <button 
                          onClick={() => handleDeleteSong(song.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
                        >
                          削除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
