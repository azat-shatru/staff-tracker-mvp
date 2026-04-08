export type Role = 'executive' | 'manager' | 'consultant' | 'analyst' | 'director'

export const ROLE_DISPLAY: Record<string, string> = {
  executive:  'Executive',
  manager:    'Manager',
  consultant: 'Consultant/AC',
  analyst:    'Analyst',
  director:   'Director',
}


export type StageType =
  | 'kickoff'
  | 'questionnaire'
  | 'programming'
  | 'fielding'
  | 'templating'
  | 'analysis'
  | 'reporting'

export type StageStatus = 'pending' | 'in_progress' | 'blocked' | 'complete'

export type ProjectStatus = 'active' | 'on_hold' | 'complete' | 'archived'

export type DeliverableType = 'daily' | 'weekly' | 'final' | 'ad_hoc'

export type DeliverableStatus = 'pending' | 'qc_required' | 'sent' | 'complete'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  team: string
  reports_to: string | null
  capacity_hours: number
  efficiency_modifier: number
  created_at: string
}

export interface Project {
  id: string
  name: string
  client: string
  project_type: string
  status: ProjectStatus
  kickoff_date: string | null
  target_delivery_date: string | null
  project_manager_id: string | null
  created_by: string
  created_at: string
}

export interface ProjectStage {
  id: string
  project_id: string
  stage: StageType
  status: StageStatus
  started_at: string | null
  completed_at: string | null
}

export interface StageNote {
  id: string
  stage_id: string
  field_key: string
  value: string
}

export interface Assignment {
  id: string
  project_id: string
  user_id: string
  role_label: string
  allocation_pct: number
  start_date: string | null
  end_date: string | null
}

export interface PocEntry {
  id: string
  project_id: string
  team_name: string
  user_id: string
}

export interface Deliverable {
  id: string
  stage_id: string
  name: string
  type: DeliverableType
  expected_at: string | null
  delivered_at: string | null
  qc_approved_by: string | null
  status: DeliverableStatus
}

export interface Leave {
  id: string
  user_id: string
  date: string
  type: string
  notes: string | null
}

export interface FileLink {
  id: string
  entity_type: string
  entity_id: string
  file_name: string
  onedrive_url: string
  added_by: string
  added_at: string
}
