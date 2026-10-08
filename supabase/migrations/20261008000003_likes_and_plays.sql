-- 1. 再生回数(play_count)カラムを追加
alter table public.songs 
add column play_count integer default 0;

-- 2. いいね(likes)テーブルの作成
create table public.likes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  song_id uuid references public.songs(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, song_id) -- 1人1回だけ「いいね」できるようにする
);

-- RLS設定
alter table public.likes enable row level security;
create policy "Likes are viewable by everyone" on public.likes for select using (true);
create policy "Users can insert their own likes" on public.likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can delete their own likes" on public.likes for delete to authenticated using (auth.uid() = user_id);

-- 3. 再生回数を安全に増やすための専用関数(RPC)を作成
create or replace function increment_play_count(song_id_param uuid)
returns void as $$
begin
  update public.songs
  set play_count = play_count + 1
  where id = song_id_param;
end;
$$ language plpgsql security definer;
