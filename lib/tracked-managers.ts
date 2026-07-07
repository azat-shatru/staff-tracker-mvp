// Managers explicitly enabled to appear in the workload tracker (staffing
// matrix, utilization drill-down, dashboard trend, and the Excel export),
// alongside every analyst and consultant.
//
// The tracker views normally filter to role IN ('analyst','consultant'). These
// four managers were added by request (2026-07-07) so their logged workload is
// counted and displayed. Other managers remain excluded. To enable another
// manager, add their user id here — no query changes needed.
export const TRACKED_MANAGER_IDS = [
  '0ba2227b-9e22-4781-ba44-48921d7f50d8', // Azat Shatru   — azat.shatru@srinsights.com
  '3f589aec-b721-4ab7-9fc5-3431a41201cf', // Swathi Bonthu — Swathi.Bonthu@srinsights.com
  'cfa21afc-e0e8-498d-94f2-5957e38ae601', // Manan Shah    — manan.shah@srinsights.com
  'f85ecc52-7d21-4512-96a1-5a190a52d42f', // Sruthi Reddy  — sruthi.reddy@srinsights.com
] as const

// Fast membership check for row-level filtering.
export const TRACKED_MANAGER_ID_SET: ReadonlySet<string> = new Set(TRACKED_MANAGER_IDS)

// PostgREST `.or()` fragment: keep the standard analyst+consultant set OR any
// explicitly-tracked manager. Use in place of `.in('role', ['analyst','consultant'])`.
export const TRACKED_USERS_OR_FILTER =
  `role.in.(analyst,consultant),id.in.(${TRACKED_MANAGER_IDS.join(',')})`
