import { NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { expireOldRequestVideos } from '@/lib/retention'
import { deleteObject } from '@/lib/storage/r2'

/** 외부 스케줄러가 매일 1회 호출. Authorization: Bearer <CRON_SECRET> 필요. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const count = await expireOldRequestVideos(admin, deleteObject, new Date())
  return NextResponse.json({ expired: count })
}
