-- 1. playlists（プレイリスト）テーブルを作成
CREATE TABLE IF NOT EXISTS public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. profilesテーブルとの外部キー連携（作成者情報をスムーズに取得するため）
ALTER TABLE public.playlists
  DROP CONSTRAINT IF EXISTS fk_playlist_profile;
ALTER TABLE public.playlists
  ADD CONSTRAINT fk_playlist_profile FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

-- 3. playlist_songs（プレイリスト内楽曲）テーブルを作成
CREATE TABLE IF NOT EXISTS public.playlist_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
  song_id uuid REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(playlist_id, song_id)
);

-- 4. songsテーブルとの外部キー連携
ALTER TABLE public.playlist_songs
  DROP CONSTRAINT IF EXISTS fk_playlist_song;
ALTER TABLE public.playlist_songs
  ADD CONSTRAINT fk_playlist_song FOREIGN KEY (song_id) REFERENCES public.songs (id) ON DELETE CASCADE;

-- 5. インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_is_public ON public.playlists(is_public);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON public.playlist_songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_song_id ON public.playlist_songs(song_id);

-- 6. RLS（Row Level Security）設定
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;

-- playlistsのポリシー
DROP POLICY IF EXISTS "Public playlists are viewable by everyone" ON public.playlists;
CREATE POLICY "Public playlists are viewable by everyone"
  ON public.playlists FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own playlists" ON public.playlists;
CREATE POLICY "Users can create their own playlists"
  ON public.playlists FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own playlists" ON public.playlists;
CREATE POLICY "Users can update their own playlists"
  ON public.playlists FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own playlists" ON public.playlists;
CREATE POLICY "Users can delete their own playlists"
  ON public.playlists FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- playlist_songsのポリシー
DROP POLICY IF EXISTS "Playlist songs are viewable if playlist is visible" ON public.playlist_songs;
CREATE POLICY "Playlist songs are viewable if playlist is visible"
  ON public.playlist_songs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_songs.playlist_id
      AND (playlists.is_public = true OR playlists.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can add songs to their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can add songs to their own playlists"
  ON public.playlist_songs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_songs.playlist_id
      AND playlists.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update songs in their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can update songs in their own playlists"
  ON public.playlist_songs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_songs.playlist_id
      AND playlists.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can remove songs from their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can remove songs from their own playlists"
  ON public.playlist_songs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists
      WHERE playlists.id = playlist_songs.playlist_id
      AND playlists.user_id = auth.uid()
    )
  );
