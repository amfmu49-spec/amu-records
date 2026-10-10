-- 1. announcementsテーブルに画像URLカラムを追加
ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS image_url text;

-- 1-2. announcementsのRLS権限を更新（認証ユーザーが確実に送信可能に）
DROP POLICY IF EXISTS "Admins can insert announcements" ON public.announcements;
CREATE POLICY "Admins can insert announcements"
  ON public.announcements FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can delete announcements" ON public.announcements;
CREATE POLICY "Admins can delete announcements"
  ON public.announcements FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- 2. コミュニティ掲示板（board_posts）テーブルを作成
CREATE TABLE IF NOT EXISTS public.board_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. profilesテーブルとの外部キー連携（投稿者の名前やアイコンをスムーズに取得）
ALTER TABLE public.board_posts
  DROP CONSTRAINT IF EXISTS fk_board_post_profile;
ALTER TABLE public.board_posts
  ADD CONSTRAINT fk_board_post_profile FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

-- 4. インデックス作成
CREATE INDEX IF NOT EXISTS idx_board_posts_created_at ON public.board_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_posts_user_id ON public.board_posts(user_id);

-- 5. RLS（セキュリティ）設定
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;

-- 全員が掲示板を閲覧可能
DROP POLICY IF EXISTS "Board posts are viewable by everyone" ON public.board_posts;
CREATE POLICY "Board posts are viewable by everyone"
  ON public.board_posts FOR SELECT
  USING (true);

-- ログインユーザーのみ投稿可能
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.board_posts;
CREATE POLICY "Authenticated users can create posts"
  ON public.board_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 自分の投稿または管理者は削除可能
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.board_posts;
CREATE POLICY "Users can delete their own posts"
  ON public.board_posts FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
