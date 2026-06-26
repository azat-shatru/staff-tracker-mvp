'use client'

import { useRef, useState } from 'react'
import { uploadHolidays, type HolidayUploadResult } from '@/app/holidays/actions'

export default function HolidayUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<HolidayUploadResult | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)
    setResult(null)

    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadHolidays(fd)

    setResult(res)
    setProcessing(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="relative">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={processing}
        className="text-xs px-3 py-1.5 border border-emerald-200 rounded text-teal-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
      >
        {processing ? 'Processing…' : '↑ Upload Holiday List (.xlsx)'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFile}
        className="hidden"
      />

      {result && (
        <div
          className={`mt-2 text-xs rounded-md px-3 py-2 ${
            result.error ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                         : 'bg-green-50 border border-green-200 text-green-700'
          }`}
        >
          {result.error ? (
            result.error
          ) : (
            <>
              Imported {result.imported} holiday{result.imported !== 1 ? 's' : ''}
              {result.years && result.years.length > 0 && ` for ${result.years.join(', ')}`}
              {result.skipped ? ` · ${result.skipped} duplicate date${result.skipped !== 1 ? 's' : ''} skipped` : ''}
              . That year’s list was replaced.
            </>
          )}
        </div>
      )}
    </div>
  )
}
