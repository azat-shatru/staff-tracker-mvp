import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAutoStage } from '@/lib/auto-stage'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient()

  let result: Awaited<ReturnType<typeof runAutoStage>>
  try {
    result = await runAutoStage(supabase)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[auto-stage] threw:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }

  if (!result.ok) {
    console.error('[auto-stage] failed:', result.error)
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  console.log(`[auto-stage] updated ${result.updated} rows`)
  return NextResponse.json(result)
}
