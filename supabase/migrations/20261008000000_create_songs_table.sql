create table public.songs (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  file_url text not null,
  user_id uuid references auth.users(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLSの有効化
alter table public.songs enable row level security;

-- 誰でもSELECT可能
create policy "Public songs are viewable by everyone."
  on songs for select
  using ( true );

-- 認証済みユーザーのみINSERT可能
create policy "Users can insert their own songs."
  on songs for insert
  to authenticated
  with check ( auth.uid() = user_id );
