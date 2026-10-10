"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import UploadForm from "@/components/UploadForm";
import UserRoleBadge from "@/components/UserRoleBadge";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<"creator" | "listener">("creator");
  const [artistName, setArtistName] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [sunoUrl, setSunoUrl] = useState("");
  const [youtubeEmbedUrl, setYoutubeEmbedUrl] = useState("");
  const [tiktokEmbedUrl, setTiktokEmbedUrl] = useState("");
  const [mySongs, setMySongs] = useState<any[]>([]);
  const [myPlaylists, setMyPlaylists] = useState<any[]>([]);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [newPlTitle, setNewPlTitle] = useState("");
  const [newPlDesc, setNewPlDesc] = useState("");
  const [newPlIsPublic, setNewPlIsPublic] = useState(true);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasProfile, setHasProfile] = useState(false);
  const [availableArtists, setAvailableArtists] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // 管理者お知らせ送信state
  const [adminTitle, setAdminTitle] = useState("");
  const [adminContent, setAdminContent] = useState("");
  const [adminCategory, setAdminCategory] = useState<"update" | "notice" | "event" | "maintenance">("update");
  const [adminLinkUrl, setAdminLinkUrl] = useState("");
  const [adminIsPinned, setAdminIsPinned] = useState(false);
  const [adminSending, setAdminSending] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState("");
  const [showAdminPassInput, setShowAdminPassInput] = useState(false);
  
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
        setRole(profile.role === "listener" ? "listener" : "creator");
        setIsAdmin(!!profile.is_admin);
        setArtistName(profile.artist_name || "");
        setTiktokUrl(profile.tiktok_url || "");
        setYoutubeUrl(profile.youtube_url || "");
        setSunoUrl(profile.suno_url || "");
        setYoutubeEmbedUrl(profile.youtube_embed_url || "");
        setTiktokEmbedUrl(profile.tiktok_embed_url || "");
        if (profile.avatar_url) {
          setAvatarPreview(profile.avatar_url);
        }
        if (profile.banner_url) {
          setBannerPreview(profile.banner_url);
        }
      } else {
        // デフォルト名
        setArtistName(user.user_metadata?.full_name || "New Artist");
        setRole("creator");
      }

      // 他の登録アーティスト一覧の取得（コラボ選択用）
      const { data: otherProfiles } = await supabase
        .from("profiles")
        .select("id, artist_name, avatar_url")
        .neq("id", user.id)
        .order("created_at", { ascending: false });
      if (otherProfiles) {
        setAvailableArtists(otherProfiles);
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

      // プレイリスト一覧の取得
      const { data: playlistsData } = await supabase
        .from("playlists")
        .select(`
          id,
          title,
          description,
          is_public,
          created_at,
          playlist_songs(
            id,
            song_id,
            songs:songs!fk_playlist_song(cover_url)
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (playlistsData) {
        setMyPlaylists(playlistsData);
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

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
      setRemoveBanner(false);
    }
  };

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerPreview(null);
    setRemoveBanner(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !artistName) return;

    setIsLoading(true);
    setMessage("");

    try {
      let finalAvatarUrl = avatarPreview;
      let finalBannerUrl = removeBanner ? null : bannerPreview;

      // アバターのアップロード
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() || 'jpg';
        const uniqueName = `${uuidv4()}.${ext}`;
        const filePath = `${user.id}/${uniqueName}`;
        
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, avatarFile);
        
        if (uploadError) throw new Error("アイコン画像のアップロードに失敗しました");

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);
          
        finalAvatarUrl = publicUrl;
      }

      // 背景バナー画像のアップロード
      if (bannerFile) {
        const ext = bannerFile.name.split('.').pop() || 'jpg';
        const uniqueName = `banner_${uuidv4()}.${ext}`;
        const filePath = `${user.id}/${uniqueName}`;
        
        const { error: uploadBannerError } = await supabase.storage
          .from("avatars")
          .upload(filePath, bannerFile);
        
        if (uploadBannerError) throw new Error("背景画像のアップロードに失敗しました");

        const { data: { publicUrl: bannerPublicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);
          
        finalBannerUrl = bannerPublicUrl;
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
          banner_url: finalBannerUrl,
          tiktok_url: tiktokUrl.trim() || null,
          youtube_url: youtubeUrl.trim() || null,
          suno_url: sunoUrl.trim() || null,
          youtube_embed_url: youtubeEmbedUrl.trim() || null,
          tiktok_embed_url: tiktokEmbedUrl.trim() || null,
          role: role,
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
  const [editCoArtist1, setEditCoArtist1] = useState("");
  const [editCoArtist2, setEditCoArtist2] = useState("");

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

  const handleBroadcastAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminTitle.trim() || !adminContent.trim()) {
      alert("タイトルと本文を入力してください");
      return;
    }

    try {
      setAdminSending(true);
      const { error } = await supabase.from("announcements").insert([
        {
          title: adminTitle.trim(),
          content: adminContent.trim(),
          category: adminCategory,
          link_url: adminLinkUrl.trim() || null,
          is_pinned: adminIsPinned,
          created_by: user?.id,
        },
      ]);

      if (error) {
        alert("配信に失敗しました: " + error.message);
        return;
      }

      alert("🎉 全ユーザーへお知らせ・アップデートを一斉送信しました！");
      setAdminTitle("");
      setAdminContent("");
      setAdminLinkUrl("");
      setAdminIsPinned(false);
    } catch (err: any) {
      alert("エラー: " + (err?.message || err));
    } finally {
      setAdminSending(false);
    }
  };

  // プレイリスト新規作成
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPlTitle.trim()) return;

    try {
      setCreatingPlaylist(true);
      const { data: newPl, error } = await supabase
        .from("playlists")
        .insert([
          {
            user_id: user.id,
            title: newPlTitle.trim(),
            description: newPlDesc.trim() || null,
            is_public: newPlIsPublic,
          },
        ])
        .select(`
          id,
          title,
          description,
          is_public,
          created_at,
          playlist_songs(
            id,
            song_id,
            songs:songs!fk_playlist_song(cover_url)
          )
        `)
        .single();

      if (error) throw error;

      setMyPlaylists(prev => [newPl, ...prev]);
      setNewPlTitle("");
      setNewPlDesc("");
      setShowCreatePlaylistModal(false);
      alert("プレイリストを作成しました！");
    } catch (err: any) {
      alert("作成に失敗しました: " + (err.message || "エラー"));
    } finally {
      setCreatingPlaylist(false);
    }
  };

  // プレイリスト削除
  const handleDeletePlaylist = async (playlistId: string) => {
    if (!confirm("このプレイリストを削除しますか？")) return;
    try {
      const { error } = await supabase.from("playlists").delete().eq("id", playlistId);
      if (error) throw error;
      setMyPlaylists(prev => prev.filter(p => p.id !== playlistId));
    } catch (err: any) {
      alert("削除に失敗しました: " + (err.message || "エラー"));
    }
  };

  const handleActivateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasscode.trim() !== "amu2026" && adminPasscode.trim() !== "amurecords") {
      alert("管理者パスコードが正しくありません");
      return;
    }

    if (!user) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_admin: true })
        .eq("id", user.id);

      if (error) {
        alert("有効化に失敗しました: " + error.message);
        return;
      }

      setIsAdmin(true);
      setShowAdminPassInput(false);
      setAdminPasscode("");
      alert("👑 管理者モード（俺）が有効化されました！お知らせを一斉配信できます。");
    } catch (err: any) {
      alert("エラー: " + (err?.message || err));
    }
  };

  const startEditing = (song: any) => {
    setEditingSongId(song.id);
    setEditTitle(song.title);
    setEditDescription(song.description || "");
    setEditCoArtist1(song.co_artist_id_1 || "");
    setEditCoArtist2(song.co_artist_id_2 || "");
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
      .update({
        title: editTitle.trim(),
        description: editDescription.trim(),
        co_artist_id_1: editCoArtist1 || null,
        co_artist_id_2: editCoArtist2 || null,
      })
      .eq("id", songId)
      .eq("user_id", user.id);

    if (error) {
      alert("更新に失敗しました: " + error.message);
    } else {
      setMySongs(mySongs.map(s => s.id === songId ? {
        ...s,
        title: editTitle.trim(),
        description: editDescription.trim(),
        co_artist_id_1: editCoArtist1 || null,
        co_artist_id_2: editCoArtist2 || null,
      } : s));
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
          <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">プロフィール設定</h1>
            <UserRoleBadge role={role} size="sm" />
          </div>
          
          <form onSubmit={handleSave} className="space-y-8">
            {/* ユーザータイプ（クリエイター / リスナー）の選択 */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">
                ユーザータイプ <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-slate-500 mb-3">
                あなたの活動スタイルに合わせて選択してください。後からいつでも変更できます。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* クリエイターカード */}
                <button
                  type="button"
                  onClick={() => setRole("creator")}
                  className={`p-4 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                    role === "creator"
                      ? "border-indigo-600 bg-indigo-50/40 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">🎨</span>
                    <UserRoleBadge role="creator" size="xs" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">クリエイター</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      オリジナル楽曲を投稿・配信し、トップのクリエイター一覧に掲載されます。
                    </p>
                  </div>
                  {role === "creator" && (
                    <div className="absolute top-3 right-3 text-indigo-600">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>

                {/* リスナーカード */}
                <button
                  type="button"
                  onClick={() => setRole("listener")}
                  className={`p-4 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                    role === "listener"
                      ? "border-emerald-600 bg-emerald-50/40 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">🎧</span>
                    <UserRoleBadge role="listener" size="xs" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">リスナー</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      音楽の試聴、いいね、コメントを専門で楽しみたい方向けです（参加クリエイター数には含まれません）。
                    </p>
                  </div>
                  {role === "listener" && (
                    <div className="absolute top-3 right-3 text-emerald-600">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            </div>

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
                アイコン画像を変更
                <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </label>
            </div>

            {/* アーティストページの背景画像（ヘッダーバナー） */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-bold text-slate-800">
                  アーティストページの背景画像
                </label>
                {bannerPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveBanner}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
                  >
                    背景をリセット
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                あなたのアーティストページ最上部のヘッダー背景を自由にカスタマイズできます。
              </p>

              {/* 推奨サイズバッジ案内 */}
              <div className="flex items-center gap-2 bg-indigo-50/70 border border-indigo-100/80 px-3.5 py-2.5 rounded-xl text-xs text-indigo-900 mb-3 font-medium">
                <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  <b>推奨画像サイズ:</b> 1920 × 600 px（横長比率 16:5〜16:9）/ 5MB以内のJPG・PNG・WebP
                </span>
              </div>

              {/* バナー画像プレビュー枠 */}
              <div className="relative w-full h-36 sm:h-44 rounded-2xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-200 group flex items-center justify-center">
                {bannerPreview ? (
                  <>
                    <img src={bannerPreview} alt="Banner Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <label className="cursor-pointer bg-white/90 hover:bg-white text-slate-900 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-md active:scale-95">
                        画像を変更
                        <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                      </label>
                      <button
                        type="button"
                        onClick={handleRemoveBanner}
                        className="bg-red-500/90 hover:bg-red-500 text-white px-4 py-2 rounded-full text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        削除
                      </button>
                    </div>
                  </>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors p-4 text-center">
                    <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-bold text-indigo-600 hover:underline">
                      クリックして背景画像をアップロード
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      横長のワイド画像が綺麗にフィットします
                    </span>
                    <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                  </label>
                )}
              </div>
            </div>

            {/* 表示名 / クリエイター名 */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                {role === "creator" ? "クリエイター名" : "表示名"} <span className="text-red-500">*</span>
                <UserRoleBadge role={role} size="xs" />
              </label>
              <input type="text" required value={artistName} onChange={e => setArtistName(e.target.value)} placeholder="名前を入力" className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" />
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

        {/* 楽曲アップロードフォーム または リスナー案内カード */}
        {hasProfile ? (
          role === "listener" ? (
            <div className="mt-12 bg-white rounded-[2rem] p-8 sm:p-10 text-center border border-emerald-100 shadow-sm animate-in fade-in duration-200">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl shadow-sm">
                🎧
              </div>
              <div className="inline-flex items-center gap-2 mb-2">
                <h3 className="text-xl font-black text-slate-900">リスナーとして登録中</h3>
                <UserRoleBadge role="listener" size="sm" />
              </div>
              <p className="text-sm text-slate-600 max-w-md mx-auto mb-6 leading-relaxed">
                お気に入りのクリエイターを見つけて、高音質ストリーミング再生やいいね、コメントをお楽しみいただけます。参加クリエイターの人数にはカウントされません。
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/"
                  className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-md transition-all active:scale-95"
                >
                  楽曲を探しにいく
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setRole("creator");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-6 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 cursor-pointer"
                >
                  クリエイターに切り替える
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-12">
              <UploadForm 
                userId={user.id} 
                profile={{ artist_name: artistName, avatar_url: avatarPreview, role: role }} 
              />
            </div>
          )
        ) : (
          <div className="mt-12 bg-white rounded-[2rem] p-8 text-center border border-slate-200">
            <p className="text-slate-500 font-medium">プロフィールを保存すると、音楽のアップロードやリスナー設定が有効になります。</p>
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
                      
                      {/* コラボクリエイター編集 */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                        <label className="block text-xs font-bold text-slate-700">コラボクリエイター設定 (最大2名)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[11px] text-slate-500 mb-0.5">コラボ相手 1</span>
                            <select
                              value={editCoArtist1}
                              onChange={e => setEditCoArtist1(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 bg-slate-50"
                            >
                              <option value="">なし</option>
                              {availableArtists.map(a => (
                                <option key={a.id} value={a.id} disabled={a.id === editCoArtist2}>
                                  {a.artist_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-500 mb-0.5">コラボ相手 2</span>
                            <select
                              value={editCoArtist2}
                              onChange={e => setEditCoArtist2(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 bg-slate-50"
                            >
                              <option value="">なし</option>
                              {availableArtists.map(a => (
                                <option key={a.id} value={a.id} disabled={a.id === editCoArtist1}>
                                  {a.artist_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
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
                      {/* サムネイル画像 */}
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-slate-200 shrink-0 shadow-sm border border-slate-200/60">
                        {song.cover_url ? (
                          <img src={song.cover_url} alt="Cover" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px] font-bold">
                            NO IMG
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <Link href={`/song/${song.id}`} className="font-bold text-slate-800 hover:text-indigo-600 hover:underline truncate block">
                          {song.title}
                        </Link>
                        {(song.co_artist_id_1 || song.co_artist_id_2) && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-indigo-600 font-semibold flex-wrap">
                            <span className="bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md text-[11px]">
                              コラボ: {artistName}
                              {song.co_artist_id_1 && ` × ${availableArtists.find(a => a.id === song.co_artist_id_1)?.artist_name || '参加者'}`}
                              {song.co_artist_id_2 && ` × ${availableArtists.find(a => a.id === song.co_artist_id_2)?.artist_name || '参加者'}`}
                            </span>
                          </div>
                        )}
                        {song.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{song.description}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-2">{new Date(song.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-start gap-2 shrink-0">
                        <Link
                          href={`/song/${song.id}`}
                          className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                        >
                          ページ
                        </Link>
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

        {/* 作成したプレイリスト管理セクション */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">
                  🎧
                </span>
                作成したプレイリスト
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                お気に入りの曲を集めたプレイリストを作成して公開・共有できます
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreatePlaylistModal(true)}
              className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>新規プレイリスト作成</span>
            </button>
          </div>

          {/* プレイリスト作成フォーム */}
          {showCreatePlaylistModal && (
            <form onSubmit={handleCreatePlaylist} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 mb-6 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-800">新しいプレイリストを作成</h4>
                <button
                  type="button"
                  onClick={() => setShowCreatePlaylistModal(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕ 閉じる
                </button>
              </div>
              <input
                type="text"
                placeholder="プレイリストのタイトル（例: 夜のチルアウトBGM）"
                value={newPlTitle}
                onChange={(e) => setNewPlTitle(e.target.value)}
                required
                maxLength={50}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-indigo-500"
              />
              <textarea
                placeholder="プレイリストの説明（任意）"
                value={newPlDesc}
                onChange={(e) => setNewPlDesc(e.target.value)}
                rows={2}
                maxLength={200}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-indigo-500 resize-none"
              />
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={newPlIsPublic}
                    onChange={(e) => setNewPlIsPublic(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span>公開する（みんなに共有）</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreatePlaylistModal(false)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:bg-slate-200/60"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={creatingPlaylist || !newPlTitle.trim()}
                    className="px-4 py-1.5 rounded-full bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {creatingPlaylist ? "作成中..." : "作成する"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* プレイリスト一覧グリッド */}
          {myPlaylists.length === 0 ? (
            <div className="text-center py-12 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-500 text-xs sm:text-sm font-medium mb-1">
                まだプレイリストがありません
              </p>
              <p className="text-slate-400 text-xs">
                右上の「新規プレイリスト作成」ボタン、または各曲の「追加」ボタンから作ることができます。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {myPlaylists.map((pl) => {
                const songCovers = (pl.playlist_songs || [])
                  .map((ps: any) => ps.songs?.cover_url)
                  .filter(Boolean);

                return (
                  <div
                    key={pl.id}
                    className="border border-slate-200 rounded-2xl p-4 bg-white hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        {/* カバーサムネイル */}
                        <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center">
                          {songCovers.length > 0 ? (
                            <img src={songCovers[0]} alt="cover" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-slate-400 text-lg">🎵</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/playlist/${pl.id}`}
                            className="font-bold text-sm text-slate-900 hover:text-indigo-600 hover:underline truncate block"
                          >
                            {pl.title}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                              pl.is_public
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : "bg-amber-50 text-amber-600 border border-amber-200"
                            }`}>
                              {pl.is_public ? "🌐 公開" : "🔒 非公開"}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {pl.playlist_songs?.length || 0}曲
                            </span>
                          </div>
                        </div>
                      </div>
                      {pl.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                          {pl.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
                      <Link
                        href={`/playlist/${pl.id}`}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                      >
                        <span>再生・詳細</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeletePlaylist(pl.id)}
                        className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 管理者専用: お知らせ・アップデート一斉送信セクション */}
        {isAdmin ? (
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl mt-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-xl">
                  📢
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold">全ユーザーへお知らせを一斉送信</h3>
                    <span className="text-[10px] bg-amber-400 text-slate-900 font-extrabold px-2 py-0.5 rounded-full">
                      管理者モード
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    ここに投稿した内容は、サイト右上ベルマーク（🔔）を通じて全訪問者へ即時配信されます。
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleBroadcastAnnouncement} className="space-y-4 pt-2">
              {/* カテゴリ選択 */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">カテゴリ</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: "update", label: "アップデート", icon: "🚀" },
                    { key: "notice", label: "お知らせ", icon: "📢" },
                    { key: "event", label: "イベント", icon: "🎉" },
                    { key: "maintenance", label: "メンテナンス", icon: "🛠" },
                  ].map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setAdminCategory(cat.key as any)}
                      className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                        adminCategory === cat.key
                          ? "bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/30"
                          : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* タイトル */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">タイトル</label>
                <input
                  type="text"
                  placeholder="例: 新機能：コラボ機能とロール設定をリリースしました！"
                  value={adminTitle}
                  onChange={(e) => setAdminTitle(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {/* 本文 */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">本文内容</label>
                <textarea
                  placeholder="ユーザーに伝えたいアップデート情報やメッセージを入力してください（改行もそのまま反映されます）"
                  value={adminContent}
                  onChange={(e) => setAdminContent(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-28 resize-none leading-relaxed"
                  required
                />
              </div>

              {/* リンクURL */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">リンクURL（任意）</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={adminLinkUrl}
                  onChange={(e) => setAdminLinkUrl(e.target.value)}
                  className="w-full px-4 py-2 text-sm rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* ピン留めチェック */}
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={adminIsPinned}
                  onChange={(e) => setAdminIsPinned(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="font-bold">先頭に固定表示する 📌</span>
              </label>

              {/* 一斉送信ボタン */}
              <button
                type="submit"
                disabled={adminSending}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-black text-sm rounded-xl transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {adminSending ? "配信処理中..." : "🚀 今すぐ全ユーザーへ一斉送信する"}
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-8 text-center">
            {showAdminPassInput ? (
              <form onSubmit={handleActivateAdmin} className="inline-flex flex-col sm:flex-row items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm max-w-md w-full mx-auto">
                <input
                  type="password"
                  placeholder="管理者パスコードを入力"
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  className="w-full sm:flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
                <div className="flex gap-1.5 w-full sm:w-auto">
                  <button
                    type="submit"
                    className="flex-1 sm:flex-none px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 cursor-pointer"
                  >
                    認証
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdminPassInput(false)}
                    className="flex-1 sm:flex-none px-3 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowAdminPassInput(true)}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline cursor-pointer"
              >
                👑 サイト管理者としてお知らせを配信する
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
