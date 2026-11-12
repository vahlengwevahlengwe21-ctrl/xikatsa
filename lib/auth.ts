export type Role =
  | 'super-administrator'
  | 'chairperson'
  | 'deputy-chairperson'
  | 'finance'
  | 'deputy-finance'
  | 'secretary'
  | 'deputy-secretary'
  | 'member';

export const SESSION_EXPIRED_EVENT = 'xikatsa:session-expired';

export const MEMBER_ROLES: Role[] = [
  'super-administrator',
  'chairperson',
  'deputy-chairperson',
  'finance',
  'deputy-finance',
  'secretary',
  'deputy-secretary',
  'member',
];

export interface SessionUser {
  id: string;
  memberId: string | null;
  loginId: string;
  name: string;
  role: Role;
}

let currentSession: SessionUser | null = null;

export const ROLE_LABELS: Record<Role, string> = {
  'super-administrator': 'System owner',
  chairperson: 'Chairperson',
  'deputy-chairperson': 'Deputy Chairperson',
  finance: 'Finance',
  'deputy-finance': 'Deputy Finance',
  secretary: 'Secretary',
  'deputy-secretary': 'Deputy Secretary',
  member: 'Member',
};

export const SETTINGS_ROLES: Role[] = [
  'super-administrator',
  'chairperson',
  'deputy-chairperson',
  'finance',
  'deputy-finance',
  'secretary',
  'deputy-secretary',
];

export const MEMBER_MANAGEMENT_ROLES: Role[] = [
  'super-administrator',
  'chairperson',
  'deputy-chairperson',
];

export const POLICY_MANAGEMENT_ROLES: Role[] = [
  ...MEMBER_MANAGEMENT_ROLES,
  'secretary',
  'deputy-secretary',
];

export const GALLERY_MANAGEMENT_ROLES: Role[] = [
  'super-administrator',
  'secretary',
  'deputy-secretary',
];

export function canManageMembers(role: Role) {
  return MEMBER_MANAGEMENT_ROLES.includes(role);
}

export function canManagePolicy(role: Role) {
  return POLICY_MANAGEMENT_ROLES.includes(role);
}

export const BENEFICIARY_REMOVAL_ROLES: Role[] = [
  'super-administrator',
  'chairperson',
  'deputy-chairperson',
];

export function canRemoveBeneficiaries(role: Role) {
  return BENEFICIARY_REMOVAL_ROLES.includes(role);
}

export const ROLE_NAV_RULES: Record<Role, Array<'/' | '/members' | '/finance' | '/benefits' | '/announcements' | '/policy' | '/gallery' | '/settings'>> = {
  'super-administrator': ['/', '/members', '/finance', '/benefits', '/announcements', '/policy', '/gallery', '/settings'],
  chairperson: ['/', '/members', '/finance', '/benefits', '/announcements', '/policy', '/settings'],
  'deputy-chairperson': ['/', '/members', '/finance', '/benefits', '/announcements', '/policy', '/settings'],
  finance: ['/', '/members', '/finance', '/benefits', '/announcements', '/policy', '/settings'],
  'deputy-finance': ['/', '/members', '/finance', '/benefits', '/announcements', '/policy', '/settings'],
  secretary: ['/', '/members', '/finance', '/benefits', '/announcements', '/policy', '/gallery', '/settings'],
  'deputy-secretary': ['/', '/members', '/finance', '/benefits', '/announcements', '/policy', '/gallery', '/settings'],
  member: ['/', '/benefits', '/announcements', '/policy'],
};

export const FINANCE_RECORDING_ROLES: Role[] = ['super-administrator', 'finance', 'deputy-finance'];
export const FINANCE_CONTROL_ROLES: Role[] = [
  'super-administrator', 'chairperson', 'deputy-chairperson', 'finance', 'deputy-finance',
];
export const GOVERNANCE_ROLES: Role[] = ['super-administrator', 'chairperson', 'deputy-chairperson'];
export const ANNOUNCEMENT_MANAGEMENT_ROLES: Role[] = [
  ...GOVERNANCE_ROLES, 'secretary', 'deputy-secretary',
];
export const SOCIETY_SETTINGS_ROLES: Role[] = FINANCE_CONTROL_ROLES;

export const ROLE_DASHBOARD_COPY: Record<Role, string> = {
  'super-administrator': 'Full access to all application functions, settings, staff roles, finance, members, benefits, policy, announcements, and photos.',
  chairperson: 'Governance lead: oversee society settings and finance, manage member records, review benefit claims, and lead policy and announcement decisions.',
  'deputy-chairperson': 'Governance support: help manage member records, review benefit claims, and support policy, announcement, and society oversight.',
  finance: 'Finance lead: record contributions, fines, receipts, expenses, and payouts; reconcile monthly balances and maintain finance settings.',
  'deputy-finance': 'Finance support: record and review money entries, help reconcile monthly balances, and maintain finance settings.',
  secretary: 'Secretary: publish and archive member announcements, amend society policy, and review operational records.',
  'deputy-secretary': 'Secretary support: help publish member announcements, amend society policy, and follow up on records.',
  member: 'Member access is limited to your own member services, claims, announcements, and society policy.',
};

export function canRecordFinance(role: Role) {
  return FINANCE_RECORDING_ROLES.includes(role);
}

export function canManageAnnouncements(role: Role) {
  return ANNOUNCEMENT_MANAGEMENT_ROLES.includes(role);
}

export function canAccessSettings(role: Role) {
  return SETTINGS_ROLES.includes(role);
}

export function canManageSocietySettings(role: Role) {
  return SOCIETY_SETTINGS_ROLES.includes(role);
}

export async function loginWithCredentials(identifier: string, password: string): Promise<SessionUser | null> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ identifier, password }),
  });

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; user?: SessionUser; error?: string } | null;
  if (response.status >= 500) throw new Error(payload?.error ?? 'Sign-in is temporarily unavailable.');
  if (!response.ok || !payload?.ok || !payload.user) return null;
  return payload.user;
}

export async function logoutSession() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Sign-out is temporarily unavailable.');
  currentSession = null;
}

export async function refreshSession(): Promise<SessionUser | null> {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'same-origin',
  });

  if (!response.ok) throw new Error('The session service is unavailable.');
  const payload = (await response.json().catch(() => null)) as { user?: SessionUser | null } | null;
  currentSession = payload?.user ?? null;
  return currentSession;
}

export function getSession(): SessionUser | null {
  return currentSession;
}

export function setSession(user: SessionUser) {
  currentSession = user;
}

export function clearSession() {
  currentSession = null;
}
