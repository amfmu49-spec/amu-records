-- songsテーブルにタイムスタンプ付き歌詞（synced_lyrics）カラムを追加
ALTER TABLE public.songs
ADD COLUMN IF NOT EXISTS synced_lyrics text;
