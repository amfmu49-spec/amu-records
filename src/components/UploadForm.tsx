"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export default function UploadForm({ userId, profile }: { userId: string, profile: any }) {
  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  
  // 著作権同意モーダルの状態
  const [showCopyrightModal, setShowCopyrightModal] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
  const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5MB

  // 許可するMIMEタイプと拡張子（セキュリティ向上）
  const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/mp3"];
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];

      // セキュリティ: 拡張子 & MIMEタイプ検証
      const ext = selected.name.split('.').pop()?.toLowerCase();
      if (ext !== "mp3" || (selected.type && !ALLOWED_AUDIO_TYPES.includes(selected.type))) {
        setMessage("エラー: MP3形式 (.mp3) の音声ファイルのみアップロード可能です");
        setFile(null);
        return;
      }

      if (selected.size > MAX_FILE_SIZE) {
        setMessage("エラー: 15MB以下のMP3を選択してください");
        setFile(null);
        return;
      }

      setFile(selected);
      setMessage("");
      if (!title) setTitle(selected.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];

      // セキュリティ: 拡張子 & MIMEタイプ検証 (SVG等は除外)
      const ext = selected.name.split('.').pop()?.toLowerCase() || '';
      const allowedExts = ["jpg", "jpeg", "png", "webp"];
      if (!allowedExts.includes(ext) || (selected.type && !ALLOWED_IMAGE_TYPES.includes(selected.type))) {
        setMessage("エラー: JPG, PNG, WEBP形式の画像のみアップロード可能です");
        setCoverFile(null);
        return;
      }

      if (selected.size > MAX_COVER_SIZE) {
        setMessage("エラー: 5MB以下の画像を選択してください");
        setCoverFile(null);
        return;
      }

      setCoverFile(selected);
      setMessage("");
    }
  };

  // フォーム送信時はまず著作権確認モーダルを開く
  const handleOpenModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    if (title.length > 100) {
      setMessage("エラー: タイトルは100文字以内で入力してください");
      return;
    }

    if (description.length > 1000) {
      setMessage("エラー: 概要は1000文字以内で入力してください");
      return;
    }

    setIsAgreed(false);
    setShowCopyrightModal(true);
  };

  // モーダルで同意後に実際のアップロードを実行
  const executeUpload = async () => {
    if (!file || !title.trim() || !isAgreed) return;

    setShowCopyrightModal(false);
    setIsUploading(true);
    setMessage("");

    try {
      // 1. MP3 アップロード
      const fileExt = "mp3";
      const uniqueFilename = `${uuidv4()}.${fileExt}`;
      const filePath = `${userId}/${uniqueFilename}`;
      const { error: uploadError } = await supabase.storage.from("songs").upload(filePath, file, {
        contentType: "audio/mpeg"
      });
      if (uploadError) throw new Error("アップロード失敗: " + uploadError.message);

      const { data: { publicUrl: songUrl } } = supabase.storage.from("songs").getPublicUrl(filePath);

      // 2. カバーアート アップロード
      let coverUrl = null;
      if (coverFile) {
        const coverExt = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const uniqueCoverName = `${uuidv4()}.${coverExt}`;
        const coverPath = `${userId}/covers/${uniqueCoverName}`;
        const { error: coverError } = await supabase.storage.from("songs").upload(coverPath, coverFile, {
          contentType: coverFile.type || "image/jpeg"
        });
        if (coverError) throw new Error("画像アップロード失敗: " + coverError.message);
        
        const { data: { publicUrl: url } } = supabase.storage.from("songs").getPublicUrl(coverPath);
        coverUrl = url;
      }

      // 3. Database Insert
      const { error: dbError } = await supabase.from("songs").insert([{
        title: title.trim(),
        description: description.trim(),
        file_url: songUrl,
        cover_url: coverUrl,
        user_id: userId,
      }]);

      if (dbError) throw dbError;

      setMessage("楽曲のアップロードが完了しました！");
      setFile(null);
      setCoverFile(null);
      setTitle("");
      setDescription("");
      router.refresh();
    } catch (err: any) {
      setMessage(`エラー: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!profile) {
    return (
      <div className="bg-white border border-slate-100 rounded-3xl p-10 text-center shadow-sm">
        <h3 className="text-xl font-bold text-slate-800 mb-4">音楽をアップロードする前に</h3>
        <p className="text-slate-500 mb-6">曲を投稿するには、アーティストプロフィール（名前やアイコン）の登録が必要です。</p>
        <button type="button" onClick={() => router.push("/profile")} className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-full font-bold transition-all shadow-md active:scale-95">
          プロフィールを登録する
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-10 mb-16 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-800 to-slate-400"></div>
        
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
            {profile.avatar_url ? (
               <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-full h-full p-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">新しい曲をアップロード</h2>
            <p className="text-sm text-slate-500 font-medium">投稿者: {profile.artist_name}</p>
          </div>
        </div>
        
        <form onSubmit={handleOpenModal} className="space-y-6 sm:space-y-7">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-7">
            <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-100">
              <label className="block text-sm font-bold text-slate-700 mb-2 sm:mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                MP3ファイル <span className="text-red-500">*</span>
              </label>
              <input type="file" accept="audio/mpeg, audio/mp3, .mp3" onChange={handleFileChange} className="block w-full text-xs sm:text-sm text-slate-500 file:mr-3 sm:file:mr-4 file:py-2 sm:file:py-2.5 file:px-4 sm:file:px-5 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 file:cursor-pointer focus:outline-none" disabled={isUploading} required />
              <p className="text-[11px] text-slate-400 mt-2">※ 最大15MB / MP3形式のみ</p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-100">
              <label className="block text-sm font-bold text-slate-700 mb-2 sm:mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                カバーアート画像 (任意)
              </label>
              <input type="file" accept="image/jpeg, image/png, image/webp" onChange={handleCoverChange} className="block w-full text-xs sm:text-sm text-slate-500 file:mr-3 sm:file:mr-4 file:py-2 sm:file:py-2.5 file:px-4 sm:file:px-5 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300 file:cursor-pointer focus:outline-none" disabled={isUploading} />
              <p className="text-[11px] text-slate-400 mt-2">※ 最大5MB / JPG, PNG, WEBP</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">曲のタイトル <span className="text-red-500">*</span></label>
            <input type="text" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="タイトルを入力 (100文字以内)" className="w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all text-sm sm:text-base" required disabled={isUploading} />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">概要・キャプション</label>
            <textarea
              value={description}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all resize-none h-24 placeholder-slate-400 text-sm sm:text-base"
              placeholder="曲に込めた想いや、歌詞などを自由に入力してください (1000文字以内)"
              disabled={isUploading}
            />
          </div>

          <button 
            type="submit" 
            disabled={!file || !title.trim() || isUploading} 
            className={`w-full mt-2 sm:mt-4 py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all active:scale-[0.99] cursor-pointer ${!file || !title.trim() || isUploading ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800 text-white shadow-lg"}`}
          >
            {isUploading ? "アップロード中..." : "アップロード内容の確認へ進む"}
          </button>
          
          {message && (
            <p className={`text-sm text-center font-medium p-3 rounded-xl ${message.startsWith("エラー") ? "bg-red-50 text-red-600 border border-red-100" : "bg-green-50 text-green-700 border border-green-100"}`}>
              {message}
            </p>
          )}
        </form>
      </div>

      {/* 著作権確認モーダル */}
      {showCopyrightModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-150 relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* 上部アクセントバー */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500"></div>

            {/* 警告アイコン & ヘッダー */}
            <div className="flex items-center gap-3.5 mb-4 sm:mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 shadow-sm">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">著作権に関するご確認</h3>
                <p className="text-xs text-slate-500 font-medium">投稿前に必ずお読みください</p>
              </div>
            </div>

            {/* 本文エリア言及文 */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 sm:p-5 mb-5 sm:mb-6">
              <p className="text-sm sm:text-base font-bold text-slate-900 leading-relaxed mb-2.5">
                「自作曲のみアップロードしてください。自身に著作権がない楽曲を投稿してトラブルが起きた際一切責任をおいません」
              </p>
              <p className="text-xs text-slate-600 leading-normal">
                第三者の権利（市販の音源、JASRAC管理楽曲、無許諾のサンプリング等）を侵害する音源のアップロードは固く禁止されています。
              </p>
            </div>

            {/* 同意チェックボックス */}
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer select-none transition-colors mb-6">
              <input 
                type="checkbox" 
                checked={isAgreed} 
                onChange={(e) => setIsAgreed(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0" 
              />
              <span className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
                上記の内容を確認・誓約し、自身が著作権を有するオリジナル楽曲であることを証明します。
              </span>
            </label>

            {/* アクションボタン */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCopyrightModal(false)}
                className="flex-1 py-3 sm:py-3.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 text-sm sm:text-base font-bold transition-all text-center cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={executeUpload}
                disabled={!isAgreed}
                className={`flex-1 py-3 sm:py-3.5 px-4 rounded-xl text-sm sm:text-base font-bold transition-all text-center cursor-pointer active:scale-95 shadow-md ${isAgreed ? "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20" : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"}`}
              >
                同意して投稿する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
