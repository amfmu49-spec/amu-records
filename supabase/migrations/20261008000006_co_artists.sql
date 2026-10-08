-- 6. コラボアーティスト機能の追加（最大3人：投稿者 + コラボ相手最大2名）
ALTER TABLE public.songs 
ADD COLUMN IF NOT EXISTS co_artist_id_1 uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS co_artist_id_2 uuid REFERENCES public.profiles(id);

-- インデックス作成（検索・アーティストページ表示の高速化）
CREATE INDEX IF NOT EXISTS idx_songs_co_artist_1 ON public.songs(co_artist_id_1);
CREATE INDEX IF NOT EXISTS idx_songs_co_artist_2 ON public.songs(co_artist_id_2);
