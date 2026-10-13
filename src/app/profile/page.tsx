"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import UploadForm from "@/components/UploadForm";
import UserRoleBadge from "@/components/UserRoleBadge";
import SupporterBadge from "@/components/SupporterBadge";
import { calculateSupporterRank, SupporterRankInfo, SUPPORTER_RANKS } from "@/utils/supporterRank";

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

  // サポーターランク関連state
  const [supporterInfo, setSupporterInfo] = useState<SupporterRankInfo | null>(null);
  const [myLikedSongs, setMyLikedSongs] = useState<any[]>([]);
  const [showRankGuideModal, setShowRankGuideModal] = useState(false);
  
  // 管理者お知らせ送信state
  const [adminTitle, setAdminTitle] = useState("");
  const [adminContent, setAdminContent] = useState("");
  const [adminCategory, setAdminCategory] = useState<"update" | "notice" | "event" | "maintenance">("update");
  const [adminLinkUrl, setAdminLinkUrl] = useState("");
  const [adminIsPinned, setAdminIsPinned] = useState(false);
  const [adminImageFile, setAdminImageFile] = useState<File | null>(null);
  const [adminImagePreview, setAdminImagePreview] = useState<string | null>(null);
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

      // いいね履歴の取得とサポーターランク計算
      const { data: likesData } = await supabase
        .from("likes")
        .select("id, song_id, created_at, songs:songs(id, title, artist, cover_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (likesData) {
        setMyLikedSongs(likesData);
        setSupporterInfo(calculateSupporterRank(likesData));
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
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCoArtist1, setEditCoArtist1] = useState("");
  const [editCoArtist2, setEditCoArtist2] = useState("");
  const [editSyncedLyrics, setEditSyncedLyrics] = useState("");
  const [editYoutubeUrl, setEditYoutubeUrl] = useState("");
  const [editTiktokUrl, setEditTiktokUrl] = useState("");
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [isUpdatingSong, setIsUpdatingSong] = useState(false);

  const handleDeleteSong = async (song: any) => {
    if (!user) return;
    const ok = window.confirm(
      `楽曲「${song.title}」を削除してもよろしいですか？\n\n※この操作は取り消せません。\n※楽曲に紐づくいいね、コメント、プレイリスト登録もすべて削除されます。`
    );
    if (!ok) return;

    try {
      setDeletingSongId(song.id);

      // 1. 専用RPCで関連データ（likes, comments, playlist_songs）を含めて安全に一括削除
      const { data, error: rpcError } = await supabase.rpc("delete_user_song", {
        p_song_id: song.id,
      });

      if (!rpcError && data && data.success) {
        setMySongs((prev) => prev.filter((s) => s.id !== song.id));
        alert(`楽曲「${song.title}」を完全に削除しました。`);
        return;
      }

      // 2. RPC未適用時のフォールバック：関連データを個別に削除してから songs レコードを削除
      await Promise.allSettled([
        supabase.from("likes").delete().eq("song_id", song.id),
        supabase.from("comments").delete().eq("song_id", song.id),
        supabase.from("playlist_songs").delete().eq("song_id", song.id),
      ]);

      const { error: deleteError } = await supabase
        .from("songs")
        .delete()
        .eq("id", song.id)
        .eq("user_id", user.id);

      if (deleteError) {
        alert("削除に失敗しました: " + deleteError.message);
        return;
      }

      setMySongs((prev) => prev.filter((s) => s.id !== song.id));
      alert(`楽曲「${song.title}」を完全に削除しました。`);
    } catch (err: any) {
      alert("削除中にエラーが発生しました: " + (err?.message || err));
    } finally {
      setDeletingSongId(null);
    }
  };

  const handleBroadcastAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminTitle.trim() || !adminContent.trim()) {
      alert("タイトルと本文を入力してください");
      return;
    }

    try {
      setAdminSending(true);

      let finalImageUrl: string | null = null;
      if (adminImageFile) {
        const ext = adminImageFile.name.split('.').pop() || 'jpg';
        const filePath = `announcements/${uuidv4()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, adminImageFile);

        if (uploadError) throw new Error("画像のアップロードに失敗しました: " + uploadError.message);

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);
        finalImageUrl = publicUrl;
      }

      let insertPayload: any = {
        title: adminTitle.trim(),
        content: adminContent.trim(),
        category: adminCategory,
        link_url: adminLinkUrl.trim() || null,
        is_pinned: adminIsPinned,
        created_by: user?.id,
      };

      if (finalImageUrl) {
        insertPayload.image_url = finalImageUrl;
      }

      let { error } = await supabase.from("announcements").insert([insertPayload]);

      // DBに image_url カラムがまだ作成されていない場合のフォールバック（自動再試行）
      if (error && (error.message?.includes("image_url") || error.details?.includes("image_url") || error.code === "PGRST204")) {
        console.warn("Retrying announcement insert without image_url...");
        delete insertPayload.image_url;
        const retry = await supabase.from("announcements").insert([insertPayload]);
        error = retry.error;
        if (!error) {
          alert("※お知らせは配信されましたが、画像カラム(image_url)がSupabaseに未反映のため画像は除外されました。SupabaseでマイグレーションSQLを実行してください。");
        }
      }

      if (error) {
        alert("配信に失敗しました: " + error.message);
        return;
      }

      alert("🎉 全ユーザーへお知らせ・アップデートを一斉送信しました！");
      setAdminTitle("");
      setAdminContent("");
      setAdminLinkUrl("");
      setAdminIsPinned(false);
      setAdminImageFile(null);
      setAdminImagePreview(null);
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
    setEditSyncedLyrics(song.synced_lyrics || "");
    setEditYoutubeUrl(song.youtube_url || "");
    setEditTiktokUrl(song.tiktok_url || "");
    setEditCoverFile(null);
    setEditCoverPreview(song.cover_url || null);
    setRemoveCover(false);
  };

  const handleUpdateSong = async (songId: string) => {
    if (!user) return;
    if (!editTitle.trim()) {
      alert("タイトルを入力してください。");
      return;
    }

    try {
      setIsUpdatingSong(true);
      let newCoverUrl = editCoverPreview;

      // 新しいカバー画像ファイルが選択されている場合、アップロード
      if (editCoverFile) {
        const coverExt = editCoverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const uniqueCoverName = `${uuidv4()}.${coverExt}`;
        const coverPath = `${user.id}/covers/${uniqueCoverName}`;
        const { error: coverError } = await supabase.storage.from("songs").upload(coverPath, editCoverFile, {
          contentType: editCoverFile.type || "image/jpeg",
          upsert: true,
        });
        if (coverError) throw new Error("カバー画像のアップロードに失敗しました: " + coverError.message);

        const { data: { publicUrl: url } } = supabase.storage.from("songs").getPublicUrl(coverPath);
        newCoverUrl = url;
      } else if (removeCover) {
        newCoverUrl = null;
      }

      const updatePayload: any = {
        title: editTitle.trim(),
        description: editDescription.trim(),
        cover_url: newCoverUrl,
        co_artist_id_1: editCoArtist1 || null,
        co_artist_id_2: editCoArtist2 || null,
        synced_lyrics: editSyncedLyrics.trim() || null,
        youtube_url: editYoutubeUrl.trim() || null,
        tiktok_url: editTiktokUrl.trim() || null,
      };

      // 本人の曲のみ更新 (user_id = user.id)
      let { error } = await supabase
        .from("songs")
        .update(updatePayload)
        .eq("id", songId)
        .eq("user_id", user.id);

      // カラム未追加時のフォールバック
      if (
        error &&
        (error.message?.includes("synced_lyrics") ||
          error.message?.includes("youtube_url") ||
          error.message?.includes("tiktok_url") ||
          error.details?.includes("synced_lyrics") ||
          error.code === "PGRST204")
      ) {
        delete updatePayload.synced_lyrics;
        delete updatePayload.youtube_url;
        delete updatePayload.tiktok_url;
        const retry = await supabase
          .from("songs")
          .update(updatePayload)
          .eq("id", songId)
          .eq("user_id", user.id);
        error = retry.error;
      }

      if (error) {
        alert("更新に失敗しました: " + error.message);
      } else {
        setMySongs(
          mySongs.map((s) =>
            s.id === songId
              ? {
                  ...s,
                  title: editTitle.trim(),
                  description: editDescription.trim(),
                  cover_url: newCoverUrl,
                  co_artist_id_1: editCoArtist1 || null,
                  co_artist_id_2: editCoArtist2 || null,
                  synced_lyrics: editSyncedLyrics.trim() || null,
                  youtube_url: editYoutubeUrl.trim() || null,
                  tiktok_url: editTiktokUrl.trim() || null,
                }
              : s
          )
        );
        setEditingSongId(null);
        alert("楽曲情報とカバーアートを更新しました！");
      }
    } catch (err: any) {
      alert("エラー: " + (err?.message || err));
    } finally {
      setIsUpdatingSong(false);
    }
  };

  if (!user) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">読み込み中...</div>;

  return (
    <main className="min-h-screen bg-white py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center text-slate-500 hover:text-slate-900 mb-8 transition-colors font-medium">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          ホームへ戻る
        </Link>

        {/* ＝＝＝ 🌟 サポーターランク ステータスカード ＝＝＝ */}
        {supporterInfo && (
          <div className="mb-8 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-[2rem] p-6 sm:p-8 text-white shadow-xl border border-indigo-500/20 relative overflow-hidden">
            {/* 背景のグローエフェクト */}
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* ヘッダー */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-6 relative z-10">
              <div className="flex items-center gap-2.5">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
                <h2 className="text-sm sm:text-base font-black tracking-wider uppercase text-indigo-200">
                  サポーターシステム
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowRankGuideModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-indigo-200 hover:text-white text-xs font-bold transition-all border border-white/15 cursor-pointer backdrop-blur-md"
              >
                <span>ℹ️</span>
                <span>ランクの仕組み</span>
              </button>
            </div>

            {/* ランクとハート色のメイン表示 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md mb-6 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-3xl shadow-inner shrink-0">
                  {supporterInfo.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                      {supporterInfo.nameJa}
                    </span>
                    {supporterInfo.rank !== "none" && (
                      <SupporterBadge rank={supporterInfo.rank} size="sm" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span>あなたのハート色:</span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] bg-black/40 border border-white/15"
                      style={{ color: supporterInfo.heartHex }}
                    >
                      <span>❤️</span>
                      <span>
                        {supporterInfo.rank === "platinum"
                          ? "プラチナサイバー"
                          : supporterInfo.rank === "gold"
                          ? "黄金ゴールド"
                          : supporterInfo.rank === "silver"
                          ? "クールシルバー"
                          : supporterInfo.rank === "bronze"
                          ? "ブロンズメタリック"
                          : "通常レッド"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 統計数値 */}
              <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-white/10 pt-3 sm:pt-0 sm:pl-5">
                <div className="text-center sm:text-right">
                  <span className="block text-[10px] font-bold text-slate-400 tracking-wider">
                    累計いいね
                  </span>
                  <span className="text-lg sm:text-2xl font-black text-white">
                    {supporterInfo.totalLikes}
                    <span className="text-xs font-normal text-slate-400 ml-0.5">回</span>
                  </span>
                </div>
                <div className="text-center sm:text-right">
                  <span className="block text-[10px] font-bold text-slate-400 tracking-wider">
                    当月いいね
                  </span>
                  <span className="text-lg sm:text-2xl font-black text-indigo-300">
                    {supporterInfo.monthlyLikes}
                    <span className="text-xs font-normal text-slate-400 ml-0.5">回</span>
                  </span>
                </div>
              </div>
            </div>

            {/* ランクアップ進捗バー（次のランクがある場合） */}
            {supporterInfo.nextRank && supporterInfo.nextRankThreshold && (
              <div className="mb-6 relative z-10 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-300 flex items-center gap-1">
                    <span>🚀 次の目標:</span>
                    <span className="text-white font-black">{supporterInfo.nextRankNameJa}</span>
                  </span>
                  <span className="font-extrabold text-amber-300">
                    あと {supporterInfo.likesToNextRank} いいね！
                  </span>
                </div>
                {/* プログレスバー */}
                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-amber-400 to-amber-300 transition-all duration-700 shadow-sm"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          6,
                          Math.round((supporterInfo.totalLikes / supporterInfo.nextRankThreshold) * 100)
                        )
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1.5 font-mono">
                  <span>現在: {supporterInfo.totalLikes} いいね</span>
                  <span>目標: {supporterInfo.nextRankThreshold} いいね</span>
                </div>
              </div>
            )}

            {/* プラチナ達成済みメッセージ */}
            {supporterInfo.rank === "platinum" && (
              <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 border border-cyan-400/40 text-center relative z-10">
                <p className="text-sm font-black text-cyan-200">
                  🎉 最高峰のプラチナサポーター達成中！
                </p>
                <p className="text-xs text-cyan-300/80 mt-0.5">
                  AMU RECORDSを熱狂的に応援していただき本当にありがとうございます！
                </p>
              </div>
            )}

            {/* 翌月ランク継続ステータス */}
            {supporterInfo.maintainCondition > 0 && (
              <div className="relative z-10 p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span>📅</span>
                    <span>翌月のランク継続条件</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      (今月 {supporterInfo.maintainCondition} いいね以上)
                    </span>
                  </span>
                  {supporterInfo.isMaintained ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 flex items-center gap-1 shadow-xs">
                      <span>✅</span>
                      <span>来月も維持確定</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 border border-amber-400/40 text-amber-200 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>あと {supporterInfo.likesToMaintain} いいね必要</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300/90 leading-relaxed">
                  {supporterInfo.isMaintained ? (
                    <span>
                      素晴らしい応援実績です！当月のいいね数が条件（{supporterInfo.monthlyLikes} / {supporterInfo.maintainCondition}回）を満たしているため、来月も現在のランクが継続されます。
                    </span>
                  ) : (
                    <span>
                      現在当月 <b className="text-white">{supporterInfo.monthlyLikes}</b> / 必要 <b className="text-white">{supporterInfo.maintainCondition}</b> 回です。今月末までにあと <b className="text-amber-300 font-bold">{supporterInfo.likesToMaintain}回</b> いいねすると、来月もランクを維持できます（未達成の場合はランクダウンとなります）。
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ランク仕組み説明モーダル */}
        {showRankGuideModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setShowRankGuideModal(false)}
          >
            <div
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>🌟</span>
                  <span>サポーターランクの仕組み</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRankGuideModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                楽曲への「いいね」を重ねることでサポーターランクが上昇し、いいねのハート色や専用バッジが進化します！
              </p>

              {/* ランク条件一覧テーブル */}
              <div className="space-y-3 mb-6">
                {/* プラチナ */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-50 to-indigo-50 border border-cyan-300/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💎</span>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm">プラチナサポーター</h4>
                      <p className="text-[11px] text-cyan-700 font-medium">
                        ハート色: プラチナサイバー
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-extrabold text-slate-900 block">50 いいね〜</span>
                    <span className="text-[10px] text-slate-500">翌月継続: 25いいね/月</span>
                  </div>
                </div>

                {/* ゴールド */}
                <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-300 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🥇</span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">ゴールドサポーター</h4>
                      <p className="text-[11px] text-amber-700 font-medium">
                        ハート色: 黄金ゴールド
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-extrabold text-slate-900 block">30 いいね〜</span>
                    <span className="text-[10px] text-slate-500">翌月継続: 15いいね/月</span>
                  </div>
                </div>

                {/* シルバー */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-300 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🥈</span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">シルバーサポーター</h4>
                      <p className="text-[11px] text-slate-600 font-medium">
                        ハート色: クールシルバー
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-extrabold text-slate-900 block">15 いいね〜</span>
                    <span className="text-[10px] text-slate-500">翌月継続: 8いいね/月</span>
                  </div>
                </div>

                {/* ブロンズ */}
                <div className="p-3.5 rounded-2xl bg-amber-900/5 border border-amber-800/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🥉</span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">ブロンズサポーター</h4>
                      <p className="text-[11px] text-[#8a4a16] font-medium">
                        ハート色: ブロンズ銅色
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-extrabold text-slate-900 block">5 いいね〜</span>
                    <span className="text-[10px] text-slate-500">翌月継続: 3いいね/月</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
                <p className="font-bold text-slate-800">📌 ランクの継続とダウンについて</p>
                <p className="leading-relaxed">
                  翌月以降、その月の継続条件（ブロンズ3回、シルバー8回、ゴールド15回、プラチナ25回）を満たすとランクが継続されます。条件を下回った場合は、当月のいいね数に応じたランクにランクダウンします。
                </p>
                <p className="leading-relaxed">
                  月途中でも昇格基準（5, 15, 30, 50）を満たせば、いつでも即座に上位ランクへ昇格します！
                </p>
              </div>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setShowRankGuideModal(false)}
                  className="px-6 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-[2rem] p-8 sm:p-12 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">プロフィール設定</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <UserRoleBadge role={role} size="sm" />
              {supporterInfo && supporterInfo.rank !== "none" && (
                <SupporterBadge rank={supporterInfo.rank} size="sm" />
              )}
            </div>
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

                      {/* タイムスタンプ付き歌詞編集 */}
                      <div className="p-3 bg-white rounded-lg border border-indigo-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <span>🎙️ タイムスタンプ歌詞 (リリモ同期用)</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setEditSyncedLyrics(
`[00:00.00] (イントロ)
[00:12.50] 静かな夜の街を歩く
[00:18.20] ネオンが滲む雨上がり
[00:24.00] 君の声がどこかで聴こえた気がした
[00:32.10] 振り返る交差点の真ん中で
[00:38.00] あのメロディが胸に響いている`
                              );
                            }}
                            className="text-[11px] text-indigo-600 hover:underline font-bold cursor-pointer"
                          >
                            例を入力
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          [00:15] 歌詞 の形式で登録すると曲詳細画面でリリモ風に自動同期されます
                        </p>
                        <textarea
                          value={editSyncedLyrics}
                          onChange={e => setEditSyncedLyrics(e.target.value)}
                          placeholder="[00:12.50] 歌詞テキスト"
                          className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-28 leading-relaxed"
                        />
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

                      {/* 動画・SNSリンク編集 */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                        <label className="block text-xs font-bold text-slate-700">動画・SNSリンク設定 (任意)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[11px] text-slate-500 mb-0.5">▶ YouTube URL</span>
                            <input
                              type="url"
                              value={editYoutubeUrl}
                              onChange={e => setEditYoutubeUrl(e.target.value)}
                              placeholder="https://youtube.com/watch?v=..."
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 bg-slate-50"
                            />
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-500 mb-0.5">🎵 TikTok URL</span>
                            <input
                              type="url"
                              value={editTiktokUrl}
                              onChange={e => setEditTiktokUrl(e.target.value)}
                              placeholder="https://tiktok.com/@... または vt.tiktok.com/..."
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-200 bg-slate-50"
                            />
                          </div>
                        </div>
                      </div>

                      {/* カバーアート (ジャケット画像) の追加・修正 */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                        <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                          <span>🖼️ カバーアート (ジャケット画像)</span>
                          {editCoverPreview && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditCoverFile(null);
                                setEditCoverPreview(null);
                                setRemoveCover(true);
                              }}
                              className="text-[11px] text-rose-500 hover:text-rose-700 hover:underline font-bold"
                            >
                              画像を削除
                            </button>
                          )}
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                            {editCoverPreview ? (
                              <img src={editCoverPreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold">NO IMG</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (!file.type.startsWith("image/")) {
                                    alert("画像ファイルを選択してください。");
                                    return;
                                  }
                                  if (file.size > 10 * 1024 * 1024) {
                                    alert("画像サイズは10MB以下にしてください。");
                                    return;
                                  }
                                  setEditCoverFile(file);
                                  setRemoveCover(false);
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setEditCoverPreview(reader.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">※ JPG / PNG / WebP（最大10MB）</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => handleUpdateSong(song.id)}
                          disabled={isUpdatingSong}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5"
                        >
                          {isUpdatingSong ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>保存中...</span>
                            </>
                          ) : (
                            <span>保存</span>
                          )}
                        </button>
                        <button
                          onClick={() => setEditingSongId(null)}
                          disabled={isUpdatingSong}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors"
                        >
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
                        {(song.youtube_url || song.tiktok_url) && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {song.youtube_url && (
                              <a
                                href={song.youtube_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-600 text-red-600 hover:text-white flex items-center justify-center transition-colors shadow-2xs"
                                title="YouTubeで観る"
                                aria-label="YouTubeで観る"
                              >
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                </svg>
                              </a>
                            )}
                            {song.tiktok_url && (
                              <a
                                href={song.tiktok_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-6 h-6 rounded-full bg-slate-900 hover:bg-black text-white flex items-center justify-center transition-colors shadow-2xs"
                                title="TikTokで観る"
                                aria-label="TikTokで観る"
                              >
                                <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 2.89 3.5 2.76 1.4-.04 2.7-1.04 3.04-2.4.15-.53.18-1.09.18-1.64V.02h-.04z"/>
                                </svg>
                              </a>
                            )}
                          </div>
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
                          type="button"
                          disabled={deletingSongId === song.id}
                          onClick={() => handleDeleteSong(song)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {deletingSongId === song.id ? "削除中..." : "削除"}
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

              {/* 画像添付（任意） */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300">画像添付（任意） 🖼️</label>
                  {adminImagePreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setAdminImageFile(null);
                        setAdminImagePreview(null);
                      }}
                      className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
                    >
                      画像を削除
                    </button>
                  )}
                </div>

                {adminImagePreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 p-2 flex items-center justify-center">
                    <img
                      src={adminImagePreview}
                      alt="添付画像プレビュー"
                      className="max-h-48 w-full object-contain rounded-lg"
                    />
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-700 border-dashed rounded-xl cursor-pointer bg-slate-850 hover:bg-slate-800 transition-colors">
                    <div className="flex flex-col items-center justify-center py-2 text-center">
                      <svg className="w-6 h-6 mb-1 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                      </svg>
                      <p className="text-xs text-slate-300 font-semibold">
                        クリックしてお知らせ画像を添付
                      </p>
                      <p className="text-[10px] text-slate-500">PNG, JPG, GIF, WebP (最大5MB)</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          if (file.size > 5 * 1024 * 1024) {
                            alert("画像サイズは5MB以下にしてください");
                            return;
                          }
                          setAdminImageFile(file);
                          setAdminImagePreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                )}
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
