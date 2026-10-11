-- 毎週月曜0時にリセットされる週間再生回数(weekly_play_count)と更新週(last_played_week)の追加
alter table public.songs 
add column if not exists weekly_play_count integer default 0,
add column if not exists last_played_week text default '';

-- 初期値として現在の play_count を weekly_play_count にコピー
update public.songs
set 
  weekly_play_count = coalesce(play_count, 0),
  last_played_week = to_char(date_trunc('week', timezone('Asia/Tokyo', now())), 'YYYY-MM-DD')
where weekly_play_count = 0 or last_played_week = '';

-- 再生回数インクリメント関数の更新（毎週月曜日0時JSTを境に週次カウントを自動リセット）
create or replace function increment_play_count(song_id_param uuid)
returns void as $$
declare
  current_week text := to_char(date_trunc('week', timezone('Asia/Tokyo', now())), 'YYYY-MM-DD');
begin
  update public.songs
  set 
    play_count = coalesce(play_count, 0) + 1,
    weekly_play_count = case 
      when last_played_week = current_week then coalesce(weekly_play_count, 0) + 1
      else 1 
    end,
    last_played_week = current_week
  where id = song_id_param;
end;
$$ language plpgsql security definer;
