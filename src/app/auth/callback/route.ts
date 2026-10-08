import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  
  if (code) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.exchangeCodeForSession(code)

    if (user) {
      // ユーザーのプロフィールが存在しない場合は自動作成
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        const displayName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'Artist'
        const avatarUrl = user.user_metadata?.avatar_url || null

        await supabase.from('profiles').insert({
          id: user.id,
          artist_name: displayName,
          avatar_url: avatarUrl,
        })
      }
    }
  }

  return NextResponse.redirect(origin)
}
