// Milestone definitions per stage — keys are stored in stage_notes as ms_{key}
// Icons are lucide-react icon names

export interface Milestone {
  key: string        // stored as ms_{key} in stage_notes
  label: string
  icon: string       // lucide icon name
}

export const STAGE_MILESTONES: Record<string, Milestone[]> = {
  kickoff: [
    { key: 'ko_deck_uploaded',   label: 'KO Deck Uploaded',      icon: 'Upload' },
    { key: 'project_type_set',   label: 'Project Type Defined',  icon: 'Tag' },
    { key: 'poc_assigned',       label: 'PoCs Assigned',         icon: 'Users' },
  ],
  questionnaire: [
    { key: 'internal_draft',     label: 'Internal Draft',        icon: 'FilePen' },
    { key: 'client_version',     label: 'Client Version',        icon: 'Send' },
    { key: 'qc_check',           label: 'QC Check',              icon: 'ShieldCheck' },
    { key: 'final_approval',     label: 'Final Approval',        icon: 'BadgeCheck' },
  ],
  programming: [
    { key: 'staffing',           label: 'Staffing',              icon: 'UserPlus' },
    { key: 'screener_testing',   label: 'Screener Testing',      icon: 'LinkIcon' },
    { key: 'full_link_testing',  label: 'Full Link Testing',     icon: 'Link2' },
    { key: 'data_verification',  label: 'Data Verification',     icon: 'DatabaseZap' },
  ],
  fielding: [
    { key: 'vendor_onboarding',  label: 'Vendor Onboarding',     icon: 'Building2' },
    { key: 'handshake_email',    label: 'Handshake Email',       icon: 'Mail' },
    { key: 'soft_launch',        label: 'Soft Launch',           icon: 'Rocket' },
    { key: 'data_verification',  label: 'Data Verification',     icon: 'ShieldCheck' },
    { key: 'full_launch',        label: 'Full Launch',           icon: 'Zap' },
    { key: 'daily_monitoring',   label: 'Daily Monitoring',      icon: 'Activity' },
  ],
  templating: [
    { key: 'prerequisite_excel', label: 'Prerequisite Excel',    icon: 'Table2' },
    { key: 'scope_call',         label: 'Scope Call',            icon: 'Phone' },
    { key: 'versioning',         label: 'Versioning',            icon: 'GitBranch' },
    { key: 'qc_check',           label: 'QC Check',              icon: 'ShieldCheck' },
  ],
  analysis: [
    { key: 'ba_onboarding',      label: 'BA Onboarding',         icon: 'UserPlus' },
    { key: 'output_generation',  label: 'Output Generation',     icon: 'BarChart2' },
    { key: 'review',             label: 'Review / Versions',     icon: 'ScanEye' },
    { key: 'finalization',       label: 'Finalization',          icon: 'Flag' },
  ],
  reporting: [
    { key: 'population',         label: 'Population',            icon: 'Database' },
    { key: 'headlining',         label: 'Headlining',            icon: 'Newspaper' },
    { key: 'topline_report',     label: 'Top-line Report',       icon: 'FileText' },
    { key: 'full_report',        label: 'Full Report',           icon: 'BookOpen' },
    { key: 'exec_summary',       label: 'Exec Summary',          icon: 'Award' },
    { key: 'internal_qc',        label: 'Internal QC',           icon: 'ClipboardCheck' },
    { key: 'client_readout',     label: 'Client Read-out',       icon: 'Presentation' },
    { key: 'followups',          label: 'Follow-ups',            icon: 'MessageSquare' },
  ],
}

export function getMilestoneNoteKey(key: string) {
  return `ms_${key}`
}
