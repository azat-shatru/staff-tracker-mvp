'use client'

import { useState, useRef, useEffect } from 'react'

const WEEK_OPTIONS = [1, 2, 4, 8, 12, 26, 52]

export default function UtilizationDownload() {
  const [open,  setOpen]  = useState(false)
  const [weeks, setWeeks] = useState(4)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-3 py-1.5 border border-emerald-200 text-xs rounded-lg hover:bg-emerald-50 transition-colors"
      >
        ↓ Utilisation Data
      </button>

      {open && (
        <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg p-4 z-20 w-56">
          <p className="text-xs font-medium text-teal-700 mb-2">Select time range</p>
          <select
            value={weeks}
            onChange={e => setWeeks(parseInt(e.target.value))}
            className="w-full border rounded px-2 py-1.5 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {WEEK_OPTIONS.map(w => (
              <option key={w} value={w}>Past {w} week{w > 1 ? 's' : ''}</option>
            ))}
          </select>
          <a
            href={`/api/utilization-export?weeks=${weeks}`}
            download
            onClick={() => setOpen(false)}
            className="block w-full text-center px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700"
          >
            Download CSV
          </a>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Includes leave days, expected & actual hours, utilisation % per employee per week.
          </p>
        </div>
      )}
    </div>
  )
}
