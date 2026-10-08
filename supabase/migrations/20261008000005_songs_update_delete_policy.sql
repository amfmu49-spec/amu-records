-- songsテーブルの更新・削除RLSポリシーを追加
-- これにより、他人の楽曲の改ざんや削除を完全に防止し、投稿者本人のみが管理できるようにする

-- 自分の曲だけ更新できるポリシー
create policy "Users can update their own songs"
  on public.songs for update
  to authenticated
  using ( auth.uid() = user_id );

-- 自分の曲だけ削除できるポリシー
create policy "Users can delete their own songs"
  on public.songs for delete
  to authenticated
  using ( auth.uid() = user_id );
