-- ＝＝＝ 楽曲削除時の外部キー制約解除＆安全削除RPC ＝＝＝

-- 1. likes テーブルの外部キーを ON DELETE CASCADE に変更
-- （楽曲削除時に紐づく「いいね」も自動連鎖削除されるようにする）
alter table public.likes
  drop constraint if exists likes_song_id_fkey;

alter table public.likes
  add constraint likes_song_id_fkey
  foreign key (song_id)
  references public.songs(id)
  on delete cascade;

-- 2. 楽曲の所有者本人が安全に曲と全関連データを一括削除できる専用RPC関数
create or replace function delete_user_song(p_song_id uuid)
returns json
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'ログインが必要です');
  end if;

  -- 楽曲の存在と所有者を確認
  select user_id into v_owner_id
  from public.songs
  where id = p_song_id;

  if v_owner_id is null then
    return json_build_object('success', false, 'error', '指定された楽曲が見つかりません');
  end if;

  if v_owner_id != v_user_id then
    return json_build_object('success', false, 'error', '他のユーザーの楽曲は削除できません');
  end if;

  -- 関連データを連鎖削除（他人のいいねやコメントも本人の曲削除に伴い安全にクリーンアップ）
  delete from public.likes where song_id = p_song_id;
  delete from public.comments where song_id = p_song_id;
  delete from public.playlist_songs where song_id = p_song_id;

  -- 楽曲本体を削除
  delete from public.songs where id = p_song_id and user_id = v_user_id;

  return json_build_object('success', true);
end;
$$;
