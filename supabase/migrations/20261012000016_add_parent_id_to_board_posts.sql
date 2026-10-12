-- ＝＝＝ コミュニティ掲示板（board_posts）に返信機能用カラムを追加 ＝＝＝
ALTER TABLE public.board_posts
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.board_posts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_board_posts_parent_id ON public.board_posts(parent_id);
