'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toggleMilestone } from '@/app/projects/[id]/milestone-actions'
import { STAGE_MILESTONES } from '@/lib/milestones'
import {
  Upload, Tag, Users, FilePen, Send, ShieldCheck, BadgeCheck,
  UserPlus, Link as LinkIcon, Link2, DatabaseZap, Building2, Mail,
  Rocket, Zap, Activity, Table2, Phone, GitBranch, BarChart2,
  ScanEye, Flag, Database, Newspaper, FileText, BookOpen, Award,
  ClipboardCheck, Presentation, MessageSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Upload, Tag, Users, FilePen, Send, ShieldCheck, BadgeCheck,
  UserPlus, LinkIcon, Link2, DatabaseZap, Building2, Mail,
  Rocket, Zap, Activity, Table2, Phone, GitBranch, BarChart2,
  ScanEye, Flag, Database, Newspaper, FileText, BookOpen, Award,
  ClipboardCheck, Presentation, MessageSquare,
}

interface Props {
  stageName: string
  stageId: string
  projectId: string
  savedNotes: Record<string, string>
  readOnly?: boolean
}

export default function StageMilestoneBar({ stageName, stageId, projectId, savedNotes, readOnly = false }: Props) {
  const milestones = STAGE_MILESTONES[stageName] ?? []
  const router = useRouter()
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  if (milestones.length === 0) return null

  const completedCount = milestones.filter(m => savedNotes[`ms_${m.key}`] === 'complete').length
  const pct = Math.round((completedCount / milestones.length) * 100)

  async function handleToggle(milestoneKey: string) {
    if (readOnly) return
    setLoadingKey(milestoneKey)
    const currentValue = savedNotes[`ms_${milestoneKey}`] ?? 'pending'
    await toggleMilestone(stageId, milestoneKey, currentValue, projectId)
    router.refresh()
    setLoadingKey(null)
  }

  return (
    <div className="space-y-2">
      {/* Progress summary */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-emerald-500">
        <span className="font-medium">Milestones</span>
        <span>{completedCount}/{milestones.length} complete</span>
      </div>

      {/* Milestone dots with connecting line */}
      <div className="relative flex items-center">
        {/* Background connector line */}
        <div className="absolute left-0 right-0 h-0.5 bg-emerald-100 dark:bg-emerald-900/50 top-1/2 -translate-y-1/2 z-0" />

        {/* Progress line */}
        <div
          className="absolute left-0 h-0.5 bg-green-500 top-1/2 -translate-y-1/2 z-0 transition-all duration-500"
          style={{ width: pct === 0 ? '0%' : `calc(${pct}% - 8px)` }}
        />

        {/* Milestone nodes */}
        <div className="relative z-10 flex items-center justify-between w-full gap-1">
          {milestones.map((m) => {
            const isComplete = savedNotes[`ms_${m.key}`] === 'complete'
            const isLoading = loadingKey === m.key
            const Icon = ICON_MAP[m.icon] ?? Flag

            return (
              <div key={m.key} className="flex flex-col items-center gap-1.5 flex-1">
                <button
                  onClick={() => handleToggle(m.key)}
                  disabled={readOnly || isLoading}
                  title={m.label}
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-200
                    ${isComplete
                      ? 'bg-green-500 border-green-500 text-white shadow-sm dark:bg-green-600 dark:border-green-600'
                      : 'bg-white border-emerald-200 text-slate-400 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-400'
                    }
                    ${!readOnly ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}
                    ${isLoading ? 'opacity-50' : ''}
                  `}
                >
                  <Icon size={14} strokeWidth={2.5} />
                </button>
                <span className={`text-center leading-tight hidden sm:block
                  ${isComplete ? 'text-green-700 font-medium dark:text-green-400' : 'text-slate-400 dark:text-emerald-600'}
                  `}
                  style={{ fontSize: '10px', maxWidth: '56px' }}
                >
                  {m.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
