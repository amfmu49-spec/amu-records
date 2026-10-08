-- コメント(comments)テーブルを作成
create table public.comments (
  id uuid default gen_random_uuid() primary key,
  song_id uuid references public.songs(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  content text not null,
  parent_id uuid references public.comments(id) on delete cascade, -- 返信先のコメントID (NULLなら通常のコメント)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS設定（セキュリティ）
alter table public.comments enable row level security;
create policy "Comments are viewable by everyone" on public.comments for select using (true);
create policy "Users can insert their own comments" on public.comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can delete their own comments" on public.comments for delete to authenticated using (auth.uid() = user_id);

-- コメント作成者のプロフィールを簡単に取得できるように連携させる
alter table public.comments 
  add constraint fk_comment_profile foreign key (user_id) references public.profiles (id);
