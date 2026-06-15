export type Role = 'member' | 'coach'

export function resolveRole(email: string | null | undefined, coachEmail: string | null | undefined): Role {
  if (!email || !coachEmail) return 'member'
  const norm = (s: string) => s.trim().toLowerCase()
  return norm(email) === norm(coachEmail) ? 'coach' : 'member'
}
