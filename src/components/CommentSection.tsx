"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

type Comment = {
  id: string;
  song_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  profiles: {
    artist_name: string;
    avatar_url: string | null;
  };
};

export default function CommentSection({ songId, currentUserId }: { songId: string, currentUserId?: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchComments();
  }, [songId]);

  const fetchComments = async () => {
    setIsLoading(true);
    // 1. コメント本体を取得 (profiles(*)を使わずに単体で取得)
    const { data: commentsData, error: commentsError } = await supabase
      .from("amu_comments")
      .select("*")
      .eq("song_id", songId)
      .order("created_at", { ascending: true });
    
    if (commentsError || !commentsData) {
      setIsLoading(false);
      return;
    }

    // 2. 必要なプロフィール情報を取得
    const userIds = [...new Set(commentsData.map(c => c.user_id))];
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, artist_name, avatar_url")
      .in("id", userIds);

    // 3. Javascript側で合体させる (Supabaseのキャッシュエラーを完全回避)
    const mergedComments = commentsData.map(comment => {
      const profile = profilesData?.find(p => p.id === comment.user_id);
      return {
        ...comment,
        profiles: profile || { artist_name: "Unknown", avatar_url: null }
      };
    });

    setComments(mergedComments);
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      alert("コメントするにはログイン（マイページの作成）が必要です");
      return;
    }
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    
    // 1. コメントを保存
    const { data: newCommentData, error } = await supabase
      .from("amu_comments")
      .insert([
        {
          song_id: songId,
          user_id: currentUserId,
          content: newComment.trim(),
          parent_id: replyingTo,
        }
      ])
      .select("*")
      .single();

    if (error) {
      console.error("Comment insert error:", error);
      alert("エラーが発生しました: " + error.message);
    } else if (newCommentData) {
      // 2. 自分のプロフィール情報を取得して合体させる
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("artist_name, avatar_url")
        .eq("id", currentUserId)
        .single();
        
      const mergedNewComment = {
        ...newCommentData,
        profiles: myProfile || { artist_name: "Unknown", avatar_url: null }
      };

      setComments([...comments, mergedNewComment]);
      setNewComment("");
      setReplyingTo(null);
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("コメントを削除しますか？")) return;
    
    // UI側で即座に削除（返信も一緒に消えるように親IDもチェック）
    setComments(comments.filter(c => c.id !== commentId && c.parent_id !== commentId));
    
    // DBから削除
    await supabase.from("amu_comments").delete().eq("id", commentId);
  };

  // コメントをツリー構造に整理（親コメント -> 子コメントのリスト）
  const parentComments = comments.filter(c => !c.parent_id);
  const getReplies = (parentId: string) => comments.filter(c => c.parent_id === parentId);

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-slate-400 animate-pulse">コメントを読み込み中...</div>;
  }

  return (
    <div className="p-5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl animate-in fade-in slide-in-from-top-4 duration-300">
      
      <div className="space-y-6 mb-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {parentComments.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-4">まだコメントはありません。最初のコメントをしてみましょう！</p>
        ) : (
          parentComments.map(comment => (
            <div key={comment.id} className="space-y-3">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0">
                  {comment.profiles?.avatar_url && (
                    <img src={comment.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-sm group relative">
                    <p className="font-bold text-slate-800 mb-1">{comment.profiles?.artist_name}</p>
                    <p className="text-slate-600 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                  <div className="flex items-center gap-4 mt-1 ml-2 text-xs text-slate-400">
                    <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                    {currentUserId && (
                      <button type="button" onClick={() => setReplyingTo(comment.id)} className="hover:text-indigo-500 font-medium transition-colors cursor-pointer select-none">
                        返信
                      </button>
                    )}
                    {currentUserId === comment.user_id && (
                      <button type="button" onClick={() => handleDelete(comment.id)} className="hover:text-red-500 font-medium transition-colors cursor-pointer select-none">
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 返信一覧 */}
              {getReplies(comment.id).length > 0 && (
                <div className="pl-11 space-y-3">
                  {getReplies(comment.id).map(reply => (
                    <div key={reply.id} className="flex gap-3">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 shrink-0">
                        {reply.profiles?.avatar_url && (
                          <img src={reply.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="bg-white px-3 py-2 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-sm">
                          <p className="font-bold text-slate-800 text-xs mb-0.5">{reply.profiles?.artist_name}</p>
                          <p className="text-slate-600 whitespace-pre-wrap">{reply.content}</p>
                        </div>
                        <div className="flex items-center gap-3 mt-1 ml-2 text-[10px] text-slate-400">
                          <span>{new Date(reply.created_at).toLocaleDateString()}</span>
                          {currentUserId === reply.user_id && (
                            <button type="button" onClick={() => handleDelete(reply.id)} className="hover:text-red-500 transition-colors cursor-pointer select-none">
                              削除
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="relative">
        {replyingTo && (
          <div className="flex items-center justify-between bg-indigo-50 text-indigo-700 text-xs px-3 py-1.5 rounded-t-lg font-medium">
            <span>{comments.find(c => c.id === replyingTo)?.profiles?.artist_name} に返信中...</span>
            <button type="button" onClick={() => setReplyingTo(null)} className="hover:text-indigo-900">キャンセル</button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={currentUserId ? "コメントを入力..." : "コメントするにはログインが必要です"}
            disabled={!currentUserId || isSubmitting}
            className={`flex-1 resize-none bg-white border ${replyingTo ? 'rounded-b-xl rounded-tr-xl' : 'rounded-xl'} px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm transition-all disabled:bg-slate-100 disabled:cursor-not-allowed h-[44px] min-h-[44px] max-h-[120px]`}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button 
            type="submit" 
            disabled={!newComment.trim() || !currentUserId || isSubmitting}
            className="w-[44px] h-[44px] rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 ml-1">Shift + Enter で改行</p>
      </form>
    </div>
  );
}
