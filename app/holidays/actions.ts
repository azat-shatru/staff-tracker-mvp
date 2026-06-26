'use server'

import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type HolidayUploadResult = {
  imported?: number
  years?: number[]
  skipped?: number          // duplicate dates collapsed
  error?: string
}

/** Only Manager / Executive may manage the holiday calendar. */
async function assertCanManage(): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['manager', 'executive'].includes(me?.role ?? '')) {
    return { error: 'Only managers and executives can manage the holiday list.' }
  }
  return null
}

/** Convert an exceljs cell value to a YYYY-MM-DD string, or null if not a date. */
function cellToDateStr(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) {
    // exceljs stores Excel date-only cells as UTC midnight — read UTC components.
    const y = v.getUTCFullYear()
    const m = String(v.getUTCMonth() + 1).padStart(2, '0')
    const d = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'object' && v !== null && 'result' in v) {
    return cellToDateStr((v as { result: unknown }).result)
  }
  if (typeof v === 'number') {
    // Excel serial date → JS Date (epoch offset 25569 days, 1900 system)
    return cellToDateStr(new Date(Math.round((v - 25569) * 86400 * 1000)))
  }
  if (typeof v === 'string') {
    const t = v.trim()
    // Accept ISO-ish strings; reject obvious non-dates
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    const parsed = new Date(t)
    if (!isNaN(parsed.getTime())) return cellToDateStr(parsed)
  }
  return null
}

function cellToText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object' && v !== null && 'result' in v) return cellToText((v as { result: unknown }).result)
  if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: unknown }).text)
  return String(v).trim()
}

/**
 * Parse an uploaded holiday Excel (cols: SL.No. | Holiday | Date | Day) and
 * REPLACE all holidays for every year present in the file. Dedupes by date.
 */
export async function uploadHolidays(formData: FormData): Promise<HolidayUploadResult> {
  const authErr = await assertCanManage()
  if (authErr) return authErr

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'No file received. Please choose an .xlsx file.' }
  }

  let wb: ExcelJS.Workbook
  try {
    wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return { error: 'Could not read the file. Make sure it is a valid .xlsx workbook.' }
  }

  const ws = wb.worksheets[0]
  if (!ws) return { error: 'The workbook has no sheets.' }

  // Locate the header row + the Holiday / Date columns (case-insensitive).
  let nameCol = -1
  let dateCol = -1
  let headerRow = -1
  ws.eachRow((row, rowNumber) => {
    if (headerRow !== -1) return
    let foundName = -1
    let foundDate = -1
    row.eachCell((cell, colNumber) => {
      const text = cellToText(cell.value).toLowerCase()
      if (text === 'holiday' || text === 'holiday name' || text === 'name') foundName = colNumber
      if (text === 'date') foundDate = colNumber
    })
    if (foundName !== -1 && foundDate !== -1) {
      headerRow = rowNumber
      nameCol = foundName
      dateCol = foundDate
    }
  })

  if (headerRow === -1) {
    return { error: 'Could not find a header row with "Holiday" and "Date" columns.' }
  }

  // Collect rows, deduping by date (keeps the first name seen for a date).
  const byDate = new Map<string, string>()
  let rawCount = 0
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return
    const dateStr = cellToDateStr(row.getCell(dateCol).value)
    if (!dateStr) return
    const name = cellToText(row.getCell(nameCol).value) || 'Holiday'
    rawCount++
    if (!byDate.has(dateStr)) byDate.set(dateStr, name)
  })

  if (byDate.size === 0) {
    return { error: 'No valid holiday rows found (need a Date in each row).' }
  }

  const years = [...new Set([...byDate.keys()].map(d => Number(d.slice(0, 4))))].sort()
  const admin = createAdminClient()

  // Replace each affected year: delete existing rows in that year, then insert.
  for (const year of years) {
    const { error: delErr } = await admin
      .from('holidays')
      .delete()
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`)
    if (delErr) return { error: `Failed clearing ${year}: ${delErr.message}` }
  }

  const rows = [...byDate.entries()].map(([holiday_date, name]) => ({ holiday_date, name }))
  const { error: insErr } = await admin.from('holidays').insert(rows)
  if (insErr) return { error: `Failed saving holidays: ${insErr.message}` }

  revalidatePath('/holidays')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')

  return {
    imported: rows.length,
    years,
    skipped: rawCount - byDate.size,
  }
}

/** Remove every holiday for a given year (admin "clear" action). */
export async function clearHolidayYear(year: number): Promise<{ error?: string; success?: boolean }> {
  const authErr = await assertCanManage()
  if (authErr) return authErr

  const admin = createAdminClient()
  const { error } = await admin
    .from('holidays')
    .delete()
    .gte('holiday_date', `${year}-01-01`)
    .lte('holiday_date', `${year}-12-31`)
  if (error) return { error: error.message }

  revalidatePath('/holidays')
  revalidatePath('/staffing')
  revalidatePath('/dashboard')
  return { success: true }
}

/** Form-action wrapper (returns void) for clearing a year via a <form>. */
export async function clearHolidayYearAction(formData: FormData): Promise<void> {
  const year = Number(formData.get('year'))
  if (!Number.isFinite(year)) return
  await clearHolidayYear(year)
}
