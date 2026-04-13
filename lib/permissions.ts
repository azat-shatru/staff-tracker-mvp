import type { Role } from './types'

export function getPermissions(role: Role | undefined) {
  if (!role) {
    return {
      canCreateProject:   false,
      canManagePoc:       false,
      canTransitionStage: false,
      canRemoveStage:     false,
      canEditNotes:       false,
      canToggleMilestone: false,
      canViewAllProjects: false,
      canManageEmployees: false,
      canViewUtilization: false,
      isReadOnly:         true,
    }
  }
  return {
    canCreateProject:          role === 'manager',
    canManagePoc:              role === 'manager',
    canTransitionStage:        role === 'manager' || role === 'consultant',
    canRemoveStage:            role === 'manager',
    canEditNotes:              role === 'manager' || role === 'consultant' || role === 'analyst',
    canToggleMilestone:        role === 'manager' || role === 'consultant' || role === 'analyst',
    canViewAllProjects:        role === 'manager' || role === 'consultant' || role === 'analyst' || role === 'director' || role === 'executive',
    canManageEmployees:        role === 'manager' || role === 'director' || role === 'executive',
    // Summary widget on dashboard (no drill-down for analyst)
    canViewUtilizationSummary: role === 'manager' || role === 'analyst' || role === 'director' || role === 'executive',
    // Full utilization: drill-down, staffing matrix, team workload
    canViewUtilization:        role === 'manager' || role === 'director' || role === 'executive',
    isReadOnly:                role === 'director',
  }
}
