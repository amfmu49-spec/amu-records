-- ＝＝＝ クリエイター宛て通知システム（いいね・コメント・返信） ＝＝＝

-- 1. notifications テーブルの作成
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null, -- 通知を受け取るクリエイター / ユーザー
  actor_id uuid references public.profiles(id) on delete cascade not null, -- アクションを起こしたユーザー
  song_id uuid references public.songs(id) on delete cascade not null, -- 対象の楽曲
  type text not null check (type in ('like', 'comment', 'reply')),
  content text, -- コメント本文など
  is_read boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- インデックス作成（パフォーマンス向上）
create index if not exists idx_notifications_user_id on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_is_read on public.notifications (user_id, is_read);

-- RLS（行セキュリティ）の有効化
alter table public.notifications enable row level security;

-- 自身の通知のみ取得可能
create policy "Users can view their own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

-- 自身の通知の既読更新が可能
create policy "Users can update their own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 自身の通知の削除が可能
create policy "Users can delete their own notifications"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- 認証ユーザーまたはトリガー関数からの挿入を許可
create policy "Authenticated users can insert notifications"
  on public.notifications for insert
  to authenticated
  with check (true);

-- Supabase Realtime でのリアルタイム受信を有効化
alter publication supabase_realtime add table public.notifications;

-- 2. いいね発生時の自動通知トリガー
create or replace function public.handle_new_like_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  v_song_creator_id uuid;
begin
  -- 対象楽曲のクリエイターを取得
  select user_id into v_song_creator_id
  from public.songs
  where id = NEW.song_id;

  -- 自身の曲へのいいねでなければクリエイターに通知
  if v_song_creator_id is not null and v_song_creator_id != NEW.user_id then
    insert into public.notifications (user_id, actor_id, song_id, type)
    values (v_song_creator_id, NEW.user_id, NEW.song_id, 'like');
  end if;

  return NEW;
end;
$$;

drop trigger if exists tr_new_like_notification on public.likes;
create trigger tr_new_like_notification
after insert on public.likes
for each row
execute function public.handle_new_like_notification();

-- 3. コメント・返信発生時の自動通知トリガー
create or replace function public.handle_new_comment_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  v_song_creator_id uuid;
  v_parent_commenter_id uuid;
begin
  -- 対象楽曲のクリエイターを取得
  select user_id into v_song_creator_id
  from public.songs
  where id = NEW.song_id;

  -- 1) 自身の曲へのコメントでなければクリエイターに通知
  if v_song_creator_id is not null and v_song_creator_id != NEW.user_id then
    insert into public.notifications (user_id, actor_id, song_id, type, content)
    values (v_song_creator_id, NEW.user_id, NEW.song_id, 'comment', NEW.content);
  end if;

  -- 2) 返信（parent_id が存在する場合）は親コメント投稿者にも通知
  if NEW.parent_id is not null then
    select user_id into v_parent_commenter_id
    from public.comments
    where id = NEW.parent_id;

    -- 親コメント投稿者が本人でもなく、かつ曲クリエイター（すでに1で通知済み）でもない場合に通知
    if v_parent_commenter_id is not null 
       and v_parent_commenter_id != NEW.user_id 
       and v_parent_commenter_id != v_song_creator_id then
      insert into public.notifications (user_id, actor_id, song_id, type, content)
      values (v_parent_commenter_id, NEW.user_id, NEW.song_id, 'reply', NEW.content);
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists tr_new_comment_notification on public.comments;
create trigger tr_new_comment_notification
after insert on public.comments
for each row
execute function public.handle_new_comment_notification();
