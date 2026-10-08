-- 1. profilesテーブルにis_adminカラムを追加
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- 2. announcements（お知らせ・アップデート配信）テーブルを作成
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'update', -- 'update', 'notice', 'event', 'maintenance'
  link_url text,
  is_pinned boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLSの有効化
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- 誰でもお知らせを閲覧可能（非ログインユーザー含む）
DROP POLICY IF EXISTS "Public announcements are viewable by everyone" ON public.announcements;
CREATE POLICY "Public announcements are viewable by everyone"
  ON public.announcements FOR SELECT
  USING (true);

-- 管理者または認証ユーザーの作成権限
DROP POLICY IF EXISTS "Admins can insert announcements" ON public.announcements;
CREATE POLICY "Admins can insert announcements"
  ON public.announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- 管理者の更新権限
DROP POLICY IF EXISTS "Admins can update announcements" ON public.announcements;
CREATE POLICY "Admins can update announcements"
  ON public.announcements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- 管理者の削除権限
DROP POLICY IF EXISTS "Admins can delete announcements" ON public.announcements;
CREATE POLICY "Admins can delete announcements"
  ON public.announcements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- 初期お知らせを登録
INSERT INTO public.announcements (title, content, category, is_pinned)
VALUES (
  '🎉 AMU RECORDSへようこそ！アップデート情報はこちらでお届けします',
  'AMU RECORDSの最新アップデートや機能追加のお知らせを、このベルマークからいつでもご確認いただけます！\n\n新機能（コラボ機能・クリエイター＆リスナーロールなど）も随時追加中です。音楽制作やリスニングをぜひお楽しみください！',
  'notice',
  true
);
