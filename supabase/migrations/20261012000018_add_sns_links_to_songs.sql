-- ＝＝＝ 楽曲への YouTube / TikTok リンク追加 ＝＝＝

alter table public.songs
  add column if not exists tiktok_url text,
  add column if not exists youtube_url text;
