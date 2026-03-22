'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateStageStatus, removeStage } from '@/app/projects/[id]/actions'
import DeliverablesSection from './DeliverablesSection'
import StageMilestoneBar from './StageMilestoneBar'
import type { ProjectStage, StageStatus, Deliverable } from '@/lib/types'

const STATUS_CONFIG: Record<StageStatus, { label: string; color: string }> = {
  pending:     { label: 'Pending',     color: 'bg-emerald-100 text-slate-500 dark:bg-emerald-900/40 dark:text-emerald-300' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  blocked:     { label: 'Blocked',     color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  complete:    { label: 'Complete',    color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
}

const TRANSITIONS: Record<StageStatus, StageStatus[]> = {
  pending:     ['in_progress'],
  in_progress: ['pending', 'blocked', 'complete'],
  blocked:     ['pending', 'in_progress'],
  complete:    ['in_progress', 'pending'],
}

const NOTE_FIELDS: Record<string, { key: string; label: string; type?: string; placeholder?: string }[]> = {
  kickoff: [
    { key: 'analysis_type', label: 'Analysis Type', placeholder: 'e.g. Regression, MaxDiff, Turf...' },
    { key: 'ko_deck_url', label: 'KO Deck (OneDrive link)', placeholder: 'Paste OneDrive URL' },
    { key: 'guidelines', label: 'Broad Guidelines / Notes', placeholder: 'Key points from client call...' },
  ],
  questionnaire: [
    { key: 'loi_minutes', label: 'LOI (minutes)', type: 'number', placeholder: '15' },
    { key: 'page_count', label: 'Page Count', type: 'number', placeholder: '10' },
    { key: 'version', label: 'Current Version', placeholder: 'v1' },
    { key: 'feedback_loops', label: 'Feedback Loops', type: 'number', placeholder: '0' },
    { key: 'draft_url', label: 'Draft (OneDrive link)', placeholder: 'Paste OneDrive URL' },
  ],
  programming: [
    { key: 'screener_link', label: 'Screener Link', placeholder: 'Survey screener URL' },
    { key: 'full_link', label: 'Full Survey Link', placeholder: 'Full survey URL' },
    { key: 'data_verified', label: 'Data Team Verification', placeholder: 'Verified by / date' },
  ],
  fielding: [
    { key: 'vendor', label: 'Vendor Name', placeholder: 'Vendor / panel provider' },
    { key: 'soft_launch_date', label: 'Soft Launch Date', type: 'date' },
    { key: 'full_launch_date', label: 'Full Launch Date', type: 'date' },
    { key: 'monitoring_notes', label: 'Daily Monitoring Notes', placeholder: 'Starts / completes...' },
  ],
  templating: [
    { key: 'prerequisite_url', label: 'Prerequisite Excel (OneDrive link)', placeholder: 'Paste OneDrive URL' },
    { key: 'template_version', label: 'Template Version', placeholder: 'v1' },
    { key: 'scope_call_notes', label: 'Scope Call Notes', placeholder: 'Key decisions...' },
  ],
  analysis: [
    { key: 'ba_team', label: 'BA Team Members', placeholder: 'Names of assigned analysts' },
    { key: 'output_type', label: 'Output Type', placeholder: 'Dashboard / Excel / Both' },
    { key: 'output_url', label: 'Output (OneDrive link)', placeholder: 'Paste OneDrive URL' },
  ],
  reporting: [
    { key: 'topline_url', label: 'Top-line Report (OneDrive link)', placeholder: 'Paste OneDrive URL' },
    { key: 'full_report_url', label: 'Full Report (OneDrive link)', placeholder: 'Paste OneDrive URL' },
    { key: 'exec_summary_url', label: 'Executive Summary (OneDrive link)', placeholder: 'Paste OneDrive URL' },
    { key: 'client_readout_date', label: 'Client Read-out Date', type: 'date' },
    { key: 'followup_notes', label: 'Follow-up Notes', placeholder: 'Post read-out actions...' },
  ],
}

interface Props {
  stage: ProjectStage | undefined
  stageName: string
  stageLabel: string
  stageNumber: number
  projectId: string
  savedNotes: Record<string, string>
  deliverables: Deliverable[]
  canTransition: boolean
  canRemove: boolean
  canEdit: boolean
  canToggleMilestone: boolean
}

export default function StageCard({ stage, stageName, stageLabel, stageNumber, projectId, savedNotes, deliverables, canTransition, canRemove, canEdit, canToggleMilestone }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<StageStatus | null>(null)
  const [showRemoveWarning, setShowRemoveWarning] = useState(false)
  const [removing, setRemoving] = useState(false)
  const router = useRouter()

  const status: StageStatus = stage?.status ?? 'pending'
  const { label, color } = STATUS_CONFIG[status]
  const nextStatuses = TRANSITIONS[status]

  async function handleTransition(newStatus: StageStatus, force = false) {
    if (!stage) return
    setUpdating(true)
    const result = await updateStageStatus(stage.id, newStatus, projectId, stageName, force)
    if (result.warning) {
      setWarning(result.warning)
      setPendingStatus(newStatus)
      setUpdating(false)
      return
    }
    setWarning(null)
    setPendingStatus(null)
    router.refresh()
    setUpdating(false)
  }

  async function handleForce() {
    if (!pendingStatus) return
    await handleTransition(pendingStatus, true)
  }

  async function handleRemove() {
    if (!stage) return
    setRemoving(true)
    await removeStage(stage.id, projectId)
    setShowRemoveWarning(false)
    setRemoving(false)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-400 w-5">{stageNumber}</span>
          <span className="font-medium text-teal-900">{stageLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
          <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Milestone bar — always visible in header */}
      {stage && (
        <div className="px-5 pb-4 border-t border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/10" onClick={e => e.stopPropagation()}>
          <StageMilestoneBar
            stageName={stageName}
            stageId={stage.id}
            projectId={projectId}
            savedNotes={savedNotes}
            readOnly={!canToggleMilestone}
          />
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t px-5 py-4 space-y-4">

          {/* Interlock warning */}
          {warning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
              <p className="text-sm text-yellow-800 mb-3">⚠ {warning}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleForce}
                  disabled={updating}
                  className="text-xs px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-40 transition-colors"
                >
                  Proceed Anyway
                </button>
                <button
                  onClick={() => { setWarning(null); setPendingStatus(null) }}
                  className="text-xs px-3 py-1.5 border border-yellow-300 text-yellow-700 rounded hover:bg-yellow-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Stage notes form */}
          <StageNotesForm
            stageId={stage?.id}
            stageName={stageName}
            projectId={projectId}
            savedNotes={savedNotes}
            canEdit={canEdit}
          />

          {/* Deliverables */}
          {stage && (
            <div className="border-t pt-4">
              <DeliverablesSection
                stageId={stage.id}
                projectId={projectId}
                deliverables={deliverables}
              />
            </div>
          )}

          {/* Status transition buttons */}
          {canTransition && nextStatuses.length > 0 && (
            <div className="flex gap-2 pt-2 border-t">
              <span className="text-xs text-slate-500 self-center mr-1">Move to:</span>
              {nextStatuses.map(next => (
                <button
                  key={next}
                  onClick={() => handleTransition(next, false)}
                  disabled={updating}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors disabled:opacity-50
                    ${STATUS_CONFIG[next].color} border-current hover:opacity-80`}
                >
                  {STATUS_CONFIG[next].label}
                </button>
              ))}
            </div>
          )}

          {/* Remove stage */}
          {canRemove && stage && (
            <div className="pt-2 border-t">
              {!showRemoveWarning ? (
                <button
                  onClick={() => setShowRemoveWarning(true)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Remove stage
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-700 mb-3">
                    ⚠ This will reset <strong>{stageLabel}</strong> to pending and permanently delete all its notes, milestones, and deliverables. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleRemove}
                      disabled={removing}
                      className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40 transition-colors"
                    >
                      {removing ? 'Removing...' : 'Yes, Remove Stage'}
                    </button>
                    <button
                      onClick={() => setShowRemoveWarning(false)}
                      className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Inline sub-component for stage notes
function StageNotesForm({
  stageId,
  stageName,
  projectId,
  savedNotes,
  canEdit,
}: {
  stageId: string | undefined
  stageName: string
  projectId: string
  savedNotes: Record<string, string>
  canEdit: boolean
}) {
  const fields = NOTE_FIELDS[stageName] ?? []
  const [values, setValues] = useState<Record<string, string>>(savedNotes)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  async function handleSave() {
    if (!stageId || !canEdit) return
    const { saveStageNotes } = await import('@/app/projects/[id]/actions')
    await saveStageNotes(stageId, values, projectId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  if (fields.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Stage Details</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map(field => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-teal-700 mb-1">{field.label}</label>
            <input
              type={field.type ?? 'text'}
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={e => canEdit && setValues(v => ({ ...v, [field.key]: e.target.value }))}
              readOnly={!canEdit}
              className={`w-full border border-emerald-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500
                ${!canEdit ? 'bg-emerald-50 text-slate-500 cursor-default dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' : 'dark:border-emerald-800'}`}
            />
          </div>
        ))}
      </div>
      {canEdit && (
        <button
          onClick={handleSave}
          disabled={!stageId}
          className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-40 transition-colors"
        >
          {saved ? 'Saved!' : 'Save Details'}
        </button>
      )}
    </div>
  )
}
