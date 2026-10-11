-- ＝＝＝ 訪問者数カウント用テーブル＆関数（TODAY / TOTAL / 12時間重複防止） ＝＝＝

-- 1. ビジターログ（同一訪問者の12時間以内重複防止テーブル）
create table if not exists public.site_visitor_logs (
  visitor_id text primary key,
  last_visit_at timestamptz not null default now()
);

-- 2. 日別訪問者数テーブル（JST日付ごとに確実に記録・永続保存）
create table if not exists public.site_daily_visits (
  date date primary key,
  count bigint not null default 0
);

-- 3. アナリティクス集計テーブル（累計訪問者数 TOTAL 等を永続記録）
create table if not exists public.site_analytics_summary (
  key text primary key,
  value bigint not null default 0
);

-- 初期レコード作成（TOTAL の初期値）
insert into public.site_analytics_summary (key, value)
values ('total_visits', 1)
on conflict (key) do nothing;

-- 今日の初期レコード作成（JST基準）
insert into public.site_daily_visits (date, count)
values (timezone('Asia/Tokyo', now())::date, 1)
on conflict (date) do nothing;

-- RLS 設定
alter table public.site_visitor_logs enable row level security;
alter table public.site_daily_visits enable row level security;
alter table public.site_analytics_summary enable row level security;

-- 全員（未ログイン含む）読み取り可能ポリシー
drop policy if exists "Allow read site_daily_visits" on public.site_daily_visits;
create policy "Allow read site_daily_visits" on public.site_daily_visits for select using (true);

drop policy if exists "Allow read site_analytics_summary" on public.site_analytics_summary;
create policy "Allow read site_analytics_summary" on public.site_analytics_summary for select using (true);

-- 4. 訪問カウント関数（12時間インターバル判定 ＆ JST日付自動リセット ＆ TODAY/TOTAL インクリメント）
create or replace function record_site_visit(p_visitor_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_jst_now timestamptz := timezone('Asia/Tokyo', now());
  v_jst_today date := v_jst_now::date;
  v_last_visit timestamptz;
  v_is_counted boolean := false;
  v_today_count bigint;
  v_total_count bigint;
begin
  -- 前回訪問日時を取得
  select last_visit_at into v_last_visit
  from public.site_visitor_logs
  where visitor_id = p_visitor_id;

  -- 12時間経過しているか、あるいは初回訪問かを厳密に判定
  if v_last_visit is null or (v_now - v_last_visit) >= interval '12 hours' then
    v_is_counted := true;

    -- 訪問ログを更新（または新規追加）
    insert into public.site_visitor_logs (visitor_id, last_visit_at)
    values (p_visitor_id, v_now)
    on conflict (visitor_id)
    do update set last_visit_at = v_now;

    -- 今日のカウントをインクリメント（JST基準）
    insert into public.site_daily_visits (date, count)
    values (v_jst_today, 1)
    on conflict (date)
    do update set count = public.site_daily_visits.count + 1;

    -- TOTAL（累計）カウントをインクリメント
    insert into public.site_analytics_summary (key, value)
    values ('total_visits', 1)
    on conflict (key)
    do update set value = public.site_analytics_summary.value + 1;
  end if;

  -- 最新の TODAY カウントを取得
  select coalesce(count, 0) into v_today_count
  from public.site_daily_visits
  where date = v_jst_today;

  -- 最新の TOTAL カウントを取得
  select coalesce(value, 0) into v_total_count
  from public.site_analytics_summary
  where key = 'total_visits';

  return json_build_object(
    'today', coalesce(v_today_count, 1),
    'total', coalesce(v_total_count, 1),
    'counted', v_is_counted
  );
end;
$$;

-- 5. 読み取り専用関数（カウントせず現在の数値を安全取得）
create or replace function get_site_visit_counts()
returns json
language plpgsql
security definer
as $$
declare
  v_jst_today date := timezone('Asia/Tokyo', now())::date;
  v_today_count bigint;
  v_total_count bigint;
begin
  select coalesce(count, 0) into v_today_count
  from public.site_daily_visits
  where date = v_jst_today;

  select coalesce(value, 0) into v_total_count
  from public.site_analytics_summary
  where key = 'total_visits';

  return json_build_object(
    'today', coalesce(v_today_count, 1),
    'total', coalesce(v_total_count, 1)
  );
end;
$$;
