-- プロフィール（アーティスト情報）を保存するテーブルを作成
create table public.profiles (
  id uuid references auth.users(id) primary key,
  artist_name text not null,
  avatar_url text,
  tiktok_url text,
  youtube_url text,
  suno_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS（セキュリティルール）の有効化
alter table public.profiles enable row level security;

-- プロフィールは誰でも閲覧可能
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

-- 自分のプロフィールだけ作成できる
create policy "Users can insert their own profile."
  on profiles for insert
  to authenticated
  with check ( auth.uid() = id );

-- 自分のプロフィールだけ更新できる
create policy "Users can update their own profile."
  on profiles for update
  to authenticated
  using ( auth.uid() = id );

-- プロフィール画像用のバケット（保存場所）を作成
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

-- アバター画像は誰でも閲覧可能
create policy "Public Access to avatars"
on storage.objects for select
using ( bucket_id = 'avatars' );

-- 認証済みユーザーのみアバター画像をアップロード可能
create policy "Authenticated users can upload avatars"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'avatars' );

create policy "Users can update their own avatars"
on storage.objects for update
to authenticated
using ( bucket_id = 'avatars' );
