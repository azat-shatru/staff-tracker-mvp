import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Vercel Cron calls this with Authorization: Bearer <CRON_SECRET>
// Set CRON_SECRET in Vercel environment variables (any random string).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient()

  // Delete daily_logs older than 30 days — daily_log_slots cascade automatically
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffDate = cutoff.toISOString().slice(0, 10)   // YYYY-MM-DD

  const { error, count } = await supabase
    .from('daily_logs')
    .delete({ count: 'exact' })
    .lt('log_date', cutoffDate)

  if (error) {
    console.error('[cleanup-logs] delete failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  console.log(`[cleanup-logs] deleted ${count} daily_logs older than ${cutoffDate}`)
  return NextResponse.json({ ok: true, deleted: count, cutoff: cutoffDate })
}
