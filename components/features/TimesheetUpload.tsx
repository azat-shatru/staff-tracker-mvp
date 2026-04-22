'use client'

import { useRef, useState } from 'react'
import { processTimesheet, syncAssignmentsFromHours, type TimesheetRow, type TimesheetResult } from '@/app/staffing/timesheet-actions'

export default function TimesheetUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<TimesheetResult | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  function parseCSVLine(line: string): string[] {
    const fields: string[] = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field — consume until closing quote, handling "" escapes
        let field = ''
        i++ // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            field += '"'
            i += 2
          } else if (line[i] === '"') {
            i++ // skip closing quote
            break
          } else {
            field += line[i++]
          }
        }
        fields.push(field.trim())
        if (line[i] === ',') i++ // skip delimiter
      } else {
        const end = line.indexOf(',', i)
        if (end === -1) {
          fields.push(line.slice(i).trim())
          break
        }
        fields.push(line.slice(i, end).trim())
        i = end + 1
      }
    }
    return fields
  }

  function parseCSV(text: string): TimesheetRow[] {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return []
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const values = parseCSVLine(line)
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = values[i] ?? '' })
      return {
        name:    obj['name'] ?? '',
        week_of: obj['week of'] ?? obj['week_of'] ?? obj['week_start'] ?? '',
        project: obj['project'] ?? obj['project_name'] ?? '',
        hours:   obj['hours'] ?? '',
        rating:  obj['rating'] ?? obj['ratings'] ?? '',
      }
    })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)
    setResult(null)
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) {
      setResult({ imported: 0, errors: [{ row: 0, message: 'No data rows found in file.' }] })
      setProcessing(false)
      return
    }
    const res = await processTimesheet(rows)
    setResult(res)
    setProcessing(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    const res = await syncAssignmentsFromHours()
    setSyncing(false)
    if (res.error) {
      setSyncMsg(`Error: ${res.error}`)
    } else {
      setSyncMsg(res.assigned === 0
        ? 'All assignments already up to date.'
        : `Done — ${res.assigned} new assignment${res.assigned !== 1 ? 's' : ''} created and allocations rebalanced.`
      )
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={processing || syncing}
          className="text-xs px-3 py-1.5 border border-emerald-200 rounded text-teal-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
        >
          {processing ? 'Processing...' : '↑ Upload Timesheet'}
        </button>
        <button
          onClick={handleSync}
          disabled={processing || syncing}
          className="text-xs px-3 py-1.5 border border-teal-300 rounded text-teal-700 hover:bg-teal-50 disabled:opacity-50 transition-colors"
        >
          {syncing ? 'Syncing...' : '⟳ Sync Assignments'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="hidden"
        />
      </div>
      {syncMsg && (
        <div className="mt-2 text-xs rounded-md px-3 py-2 bg-teal-50 border border-teal-200 text-teal-800">
          {syncMsg}
        </div>
      )}

      {result && (
        <div className={`mt-2 text-xs rounded-md px-3 py-2 ${result.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
          <p className={result.errors.length > 0 ? 'text-yellow-800' : 'text-green-700'}>
            {result.imported} row{result.imported !== 1 ? 's' : ''} imported.
            {result.errors.length > 0 && ` ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}.`}
          </p>
          {result.errors.map((e, i) => (
            <p key={i} className="text-yellow-700 mt-0.5">
              Row {e.row}: {e.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
