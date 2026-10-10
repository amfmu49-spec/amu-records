-- profilesテーブルにアーティストページの背景画像（banner_url）カラムを追加
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS banner_url text;
