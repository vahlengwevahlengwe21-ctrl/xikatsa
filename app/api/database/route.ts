import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  FINANCE_CONTROL_ROLES,
  FINANCE_RECORDING_ROLES,
  GOVERNANCE_ROLES,
  ANNOUNCEMENT_MANAGEMENT_ROLES,
  MEMBER_MANAGEMENT_ROLES,
  POLICY_MANAGEMENT_ROLES,
  SOCIETY_SETTINGS_ROLES,
  type Role,
  type SessionUser,
} from '@/lib/auth';
import {
  addCalendarMonths,
  dateOnly,
  DEPENDANT_WAITING_PERIOD_MONTHS,
  isValidIsoDate,
  MAX_ACTIVE_DEPENDANTS,
  todayIso,
} from '@/lib/format';
import { isValidIdNumber, normalizeIdNumber } from '@/lib/id-number';
import { getAuthenticatedUser, hashPassword, isSameOrigin } from '@/lib/server-auth';
import { execute, one, rows } from '@/lib/server-database';

type Input = Record<string, unknown>;

const sql = {
  listMembers: `SELECT id, member_number, full_name, first_name, surname, email, phone, alternate_phone,
    address, date_joined, status, deceased_at, monthly_contribution, notes, created_at
    FROM members WHERE NOT EXISTS (
      SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE u.member_id = members.id AND r.role_key = 'super-administrator'
    ) ORDER BY member_number ASC`,
  listMemberById: `SELECT id, member_number, full_name, first_name, surname, email, phone, alternate_phone,
    address, date_joined, status, deceased_at, monthly_contribution, notes, created_at
    FROM members WHERE id = ? AND NOT EXISTS (
      SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE u.member_id = members.id AND r.role_key = 'super-administrator'
    ) ORDER BY member_number ASC`,
  activeMembers: "SELECT id, full_name, member_number FROM members WHERE status = 'active' ORDER BY full_name ASC",
  memberById: 'SELECT * FROM members WHERE id = ?',
  deleteMember: 'DELETE FROM members WHERE id = ?',
  markMemberDeceased: `UPDATE members SET status = 'inactive', deceased_at = CURRENT_DATE
    WHERE id = ? AND deceased_at IS NULL`,
  disableUserForMember: 'UPDATE users SET is_active = FALSE WHERE member_id = ?',
  revokeMemberSessions: 'DELETE s FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE u.member_id = ?',
  superAdministratorMember: "SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.member_id = ? AND r.role_key = 'super-administrator' LIMIT 1",
  nextMemberNumber: 'SELECT NEXT VALUE FOR member_number_seq AS sequence_number',
  insertMember: `INSERT INTO members (id, member_number, full_name, first_name, surname, id_number, email, phone,
    alternate_phone, address, date_joined, status, monthly_contribution, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  updateMember: `UPDATE members SET full_name = ?, first_name = ?, surname = ?, id_number = ?, email = ?, phone = ?,
    alternate_phone = ?, address = ?, date_joined = ?, status = ?, monthly_contribution = ?, notes = ?
    WHERE id = ?`,
  memberIdentityExists: 'SELECT id FROM members WHERE id_number = ? AND id <> ? LIMIT 1',
  userEmailExists: 'SELECT id FROM users WHERE email = ? AND (member_id IS NULL OR member_id <> ?) LIMIT 1',
  userLoginIdExists: 'SELECT id FROM users WHERE login_id = ? AND id <> ? LIMIT 1',
  insertMemberUser: `INSERT INTO users (id, member_id, login_id, full_name, email, contact_number, password_hash, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  insertStaffMemberUser: `INSERT INTO users (id, member_id, full_name, contact_number, login_id, password_hash, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  staffMemberContribution: "SELECT setting_value FROM society_settings WHERE setting_key = 'defaultMonthlyContribution'",
  updateStaffMember: 'UPDATE members SET full_name = ?, first_name = ?, surname = ?, id_number = ?, phone = ? WHERE id = ?',
  updateMemberUser: 'UPDATE users SET full_name = ?, email = ?, contact_number = ?, login_id = ?, is_active = ? WHERE member_id = ?',
  disableMemberUser: 'UPDATE users SET is_active = FALSE WHERE member_id = ? AND ? <> \'active\'',
  overviewMembers: 'SELECT id, status, monthly_contribution FROM members',
  claimMembers: `SELECT id, full_name, member_number, status, date_joined, deceased_at
    FROM members WHERE NOT EXISTS (
      SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE u.member_id = members.id AND r.role_key = 'super-administrator'
    ) ORDER BY full_name ASC`,
  overviewOpenClaims: "SELECT id, amount FROM benefit_claims WHERE status IN ('pending', 'approved')",
  listTransactions: 'SELECT t.*, m.full_name AS member_full_name, m.member_number AS member_member_number FROM transactions t LEFT JOIN members m ON m.id = t.member_id ORDER BY t.occurred_on DESC, t.created_at DESC',
  transactionsForMember: 'SELECT t.*, m.full_name AS member_full_name, m.member_number AS member_member_number FROM transactions t LEFT JOIN members m ON m.id = t.member_id WHERE t.member_id = ? ORDER BY t.occurred_on DESC',
  insertTransaction: 'INSERT INTO transactions (kind, amount, description, category, reference, occurred_on, member_id, claim_id, recorded_by_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  deleteTransaction: 'DELETE FROM transactions WHERE id = ?',
  listDependants: 'SELECT * FROM dependants WHERE member_id = ? ORDER BY created_at ASC',
  activeDependants: 'SELECT * FROM dependants WHERE member_id = ? AND is_active = TRUE AND deceased_at IS NULL ORDER BY created_at ASC',
  activeDependantCount: 'SELECT COUNT(*) AS active_count FROM dependants WHERE member_id = ? AND is_active = TRUE AND deceased_at IS NULL',
  dependantActiveState: 'SELECT is_active, deceased_at FROM dependants WHERE id = ? AND member_id = ?',
  insertDependant: `INSERT INTO dependants (id, member_id, full_name, first_name, surname, id_number,
    relationship, date_of_birth, phone, share_percent, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  updateDependant: `UPDATE dependants SET full_name = ?, first_name = ?, surname = ?, id_number = ?,
    relationship = ?, date_of_birth = ?, phone = ?, share_percent = ?, is_active = ?
    WHERE id = ? AND member_id = ? AND deceased_at IS NULL`,
  retireDependant: `UPDATE dependants
    SET is_active = FALSE, deceased_at = CASE WHEN ? = TRUE THEN CURRENT_DATE ELSE deceased_at END
    WHERE id = ? AND is_active = TRUE AND deceased_at IS NULL`,
  dependantIdExists: 'SELECT id FROM dependants WHERE id_number = ? AND id <> ? LIMIT 1',
  listBeneficiaries: 'SELECT * FROM beneficiaries WHERE member_id = ? ORDER BY created_at ASC',
  activeBeneficiaries: 'SELECT * FROM beneficiaries WHERE member_id = ? AND is_active = TRUE AND deceased_at IS NULL ORDER BY created_at ASC',
  beneficiaryActiveState: 'SELECT is_active, deceased_at FROM beneficiaries WHERE id = ? AND member_id = ?',
  insertBeneficiary: `INSERT INTO beneficiaries (id, member_id, full_name, first_name, surname, id_number,
    relationship, date_of_birth, phone, share_percent, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  updateBeneficiary: `UPDATE beneficiaries SET full_name = ?, first_name = ?, surname = ?, id_number = ?,
    relationship = ?, date_of_birth = ?, phone = ?, share_percent = ?, is_active = ?
    WHERE id = ? AND member_id = ? AND deceased_at IS NULL`,
  retireBeneficiary: `UPDATE beneficiaries
    SET is_active = FALSE, deceased_at = CASE WHEN ? = TRUE THEN CURRENT_DATE ELSE deceased_at END
    WHERE id = ? AND is_active = TRUE AND deceased_at IS NULL`,
  beneficiaryIdExists: 'SELECT id FROM beneficiaries WHERE id_number = ? AND id <> ? LIMIT 1',
  listPrograms: 'SELECT * FROM benefit_programs ORDER BY name ASC',
  activePrograms: 'SELECT * FROM benefit_programs WHERE is_active = TRUE ORDER BY name ASC',
  insertProgram: 'INSERT INTO benefit_programs (id, name, description, benefit_amount, frequency, eligibility, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
  updateProgram: 'UPDATE benefit_programs SET name = ?, description = ?, benefit_amount = ?, frequency = ?, eligibility = ?, is_active = ? WHERE id = ?',
  listClaims: `SELECT c.*, m.full_name AS member_full_name, m.member_number AS member_member_number,
    p.name AS program_name, b.full_name AS beneficiary_full_name, d.full_name AS dependant_full_name
    FROM benefit_claims c LEFT JOIN members m ON m.id = c.member_id
    LEFT JOIN benefit_programs p ON p.id = c.program_id
    LEFT JOIN beneficiaries b ON b.id = c.death_beneficiary_id
    LEFT JOIN dependants d ON d.id = c.dependant_id
    ORDER BY c.requested_on DESC, c.created_at DESC`,
  claimsForMember: `SELECT c.*, m.full_name AS member_full_name, m.member_number AS member_member_number,
    p.name AS program_name, b.full_name AS beneficiary_full_name, d.full_name AS dependant_full_name
    FROM benefit_claims c LEFT JOIN members m ON m.id = c.member_id
    LEFT JOIN benefit_programs p ON p.id = c.program_id
    LEFT JOIN beneficiaries b ON b.id = c.death_beneficiary_id
    LEFT JOIN dependants d ON d.id = c.dependant_id
    WHERE c.member_id = ? ORDER BY c.requested_on DESC`,
  insertClaim: "INSERT INTO benefit_claims (id, member_id, dependant_id, death_beneficiary_id, program_id, amount, status, reason, requested_on) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
  activeProgramAmount: 'SELECT benefit_amount FROM benefit_programs WHERE id = ? AND is_active = TRUE LIMIT 1',
  activeMemberBeneficiary: 'SELECT id FROM beneficiaries WHERE id = ? AND member_id = ? AND is_active = TRUE AND deceased_at IS NULL LIMIT 1',
  activeMemberDependant: 'SELECT id FROM dependants WHERE id = ? AND member_id = ? AND is_active = TRUE AND deceased_at IS NULL LIMIT 1',
  updateClaimStatus: 'UPDATE benefit_claims SET status = ?, decided_on = ? WHERE id = ?',
  insertPayout: "INSERT INTO transactions (kind, amount, description, category, occurred_on, member_id, claim_id) VALUES ('benefit_payout', ?, ?, 'Benefits', ?, ?, ?)",
  markClaimPaid: "UPDATE benefit_claims SET status = 'paid', paid_on = ? WHERE id = ?",
  listAnnouncements: 'SELECT * FROM announcements WHERE is_active = TRUE AND (expires_on IS NULL OR expires_on >= CURRENT_DATE) ORDER BY published_at DESC',
  insertAnnouncement: 'INSERT INTO announcements (id, title, body, severity, expires_on, published_by_role) VALUES (?, ?, ?, ?, ?, ?)',
  archiveAnnouncement: 'UPDATE announcements SET is_active = FALSE WHERE id = ?',
  listRoles: 'SELECT role_key, label FROM roles ORDER BY id ASC',
  roleExists: 'SELECT id FROM roles WHERE role_key = ? LIMIT 1',
  loadSettings: 'SELECT setting_key, setting_value FROM society_settings',
  saveSettings: `INSERT INTO society_settings (setting_key, setting_value) VALUES
    ('joiningFee', ?), ('defaultMonthlyContribution', ?), ('waitingPeriodMonths', ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
  openingBalance: 'SELECT opening_balance, effective_month FROM society_finance_opening_balance WHERE id = 1',
  saveOpeningBalance: `INSERT INTO society_finance_opening_balance (id, opening_balance, effective_month, updated_by_role)
    VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE opening_balance = VALUES(opening_balance), effective_month = VALUES(effective_month), updated_by_role = VALUES(updated_by_role)`,
  policyLoad: 'SELECT document_name, document_mime_type, document_size, updated_by_role, updated_at FROM society_policy WHERE id = 1',
  policyDocument: 'SELECT document_name, document_mime_type, TO_BASE64(document_data) AS document_base64 FROM society_policy WHERE id = 1',
  policySave: `UPDATE society_policy SET document_name = ?, document_mime_type = ?,
    document_size = ?, document_data = FROM_BASE64(?), updated_by_role = ? WHERE id = 1`,
  listUsers: `SELECT u.id, u.full_name, u.contact_number, u.email, u.login_id, u.member_id, u.is_active, u.created_at, r.role_key AS role
    FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
    ORDER BY u.full_name ASC`,
  committeeRoster: `SELECT u.id AS user_id, u.member_id, u.full_name, u.login_id, u.is_active,
      r.role_key AS role, m.member_number, m.date_joined, m.monthly_contribution, m.status AS member_status, m.deceased_at
    FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
    LEFT JOIN members m ON m.id = u.member_id
    WHERE r.role_key IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary')
      AND NOT EXISTS (
        SELECT 1 FROM user_roles protected_ur JOIN roles protected_r ON protected_r.id = protected_ur.role_id
        WHERE protected_ur.user_id = u.id AND protected_r.role_key = 'super-administrator'
      )
    ORDER BY r.id ASC, u.full_name ASC`,
  committeeAccount: `SELECT u.member_id, m.deceased_at, r.role_key AS role
    FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
    LEFT JOIN members m ON m.id = u.member_id WHERE u.id = ?
      AND r.role_key IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary')
      AND NOT EXISTS (
        SELECT 1 FROM user_roles protected_ur JOIN roles protected_r ON protected_r.id = protected_ur.role_id
        WHERE protected_ur.user_id = u.id AND protected_r.role_key = 'super-administrator'
      )
    LIMIT 1`,
  markCommitteeDeceased: `UPDATE users u JOIN members m ON m.id = u.member_id
    JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
    SET u.is_active = FALSE, m.status = 'inactive', m.deceased_at = CURRENT_DATE
    WHERE u.id = ? AND m.deceased_at IS NULL
      AND r.role_key IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary')
      AND NOT EXISTS (
        SELECT 1 FROM user_roles protected_ur JOIN roles protected_r ON protected_r.id = protected_ur.role_id
        WHERE protected_ur.user_id = u.id AND protected_r.role_key = 'super-administrator'
      )`,
  assignRole: `INSERT INTO user_roles (user_id, role_id)
    SELECT ?, id FROM roles WHERE role_key = ?
    ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
  updateUser: 'UPDATE users SET full_name = ?, contact_number = ?, login_id = ?, is_active = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
  updateUserPassword: 'UPDATE users SET full_name = ?, contact_number = ?, login_id = ?, is_active = ?, password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
  revokeUserSessions: 'DELETE FROM user_sessions WHERE user_id = ?',
};

class DatabaseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function asInput(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabaseError('Invalid database request.', 400);
  }
  return value as Input;
}

function text(input: Input, key: string, required = true): string | null {
  const value = input[key];
  if (value === null || value === undefined || value === '') {
    if (!required) return null;
    throw new DatabaseError(`Missing ${key}.`, 400);
  }
  if (typeof value !== 'string') throw new DatabaseError(`Invalid ${key}.`, 400);
  return value;
}

function number(input: Input, key: string, minimum: number): number {
  const value = Number(input[key]);
  if (!Number.isFinite(value) || value < minimum) throw new DatabaseError(`Invalid ${key}.`, 400);
  return value;
}

function money(input: Input, key: string, minimum: number): number {
  const value = number(input, key, minimum);
  const cents = Math.round(value * 100);
  if (value > 9_999_999_999.99 || Math.abs(value * 100 - cents) > 1e-7) {
    throw new DatabaseError(`Invalid ${key}; use an amount with no more than two decimal places.`, 400);
  }
  return cents / 100;
}

function signedMoney(input: Input, key: string): number {
  const value = Number(input[key]);
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || Math.abs(value) > 9_999_999_999.99 || Math.abs(value * 100 - cents) > 1e-7) {
    throw new DatabaseError(`Invalid ${key}; use an amount with no more than two decimal places.`, 400);
  }
  return cents / 100;
}

function monthStart(input: Input, key: string): string {
  const value = text(input, key) as string;
  if (!/^\d{4}-\d{2}$/.test(value) || !isValidIsoDate(`${value}-01`)) {
    throw new DatabaseError(`Invalid ${key}; choose a valid month.`, 400);
  }
  return `${value}-01`;
}

function boolean(input: Input, key: string, fallback = false): boolean {
  const value = input[key];
  return typeof value === 'boolean' ? value : fallback;
}

function choice<T extends string>(input: Input, key: string, values: readonly T[]): T {
  const value = input[key];
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new DatabaseError(`Invalid ${key}.`, 400);
  }
  return value as T;
}

function withMember<T extends Record<string, unknown>>(row: T) {
  const { member_full_name: fullName, member_member_number: memberNumber, ...rest } = row;
  return { ...rest, member: fullName ? { full_name: fullName, member_number: memberNumber } : null };
}

function withClaimRelations<T extends Record<string, unknown>>(row: T) {
  const {
    member_full_name: memberName,
    member_member_number: memberNumber,
    program_name: programName,
    beneficiary_full_name: beneficiaryName,
    dependant_full_name: dependantName,
    ...rest
  } = row;
  return {
    ...rest,
    member: memberName ? { full_name: memberName, member_number: memberNumber } : null,
    program: programName ? { name: programName } : null,
    beneficiary: beneficiaryName ? { full_name: beneficiaryName } : null,
    dependant: dependantName ? { full_name: dependantName } : null,
  };
}

function dateToday(): string {
  return todayIso();
}

function withEligibility<T extends Record<string, unknown>>(dependants: T[]) {
  return dependants.map((beneficiary) => {
    const rawCreatedAt = beneficiary.created_at;
    let createdOn: string;
    try {
      createdOn = dateOnly(rawCreatedAt instanceof Date ? rawCreatedAt : String(rawCreatedAt ?? ''));
    } catch {
      throw new DatabaseError('A beneficiary record has an invalid registration date.', 502);
    }
    return {
      ...beneficiary,
      eligible_on: addCalendarMonths(createdOn, DEPENDANT_WAITING_PERIOD_MONTHS),
    };
  });
}

const STAFF_ROLES: Role[] = [
  'super-administrator', 'chairperson', 'deputy-chairperson',
  'finance', 'deputy-finance', 'secretary', 'deputy-secretary',
];
const MAX_POLICY_DOCUMENT_SIZE = 8 * 1024 * 1024;
const MAX_GALLERY_IMAGE_SIZE = 3 * 1024 * 1024;

function galleryImage(input: Input) {
  const mimeType = choice(input, 'mime_type', ['image/jpeg', 'image/png', 'image/webp'] as const);
  const encodedImage = text(input, 'image_base64') as string;
  const maximumEncodedLength = Math.ceil(MAX_GALLERY_IMAGE_SIZE / 3) * 4;
  if (
    encodedImage.length === 0 ||
    encodedImage.length > maximumEncodedLength ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedImage)
  ) {
    throw new DatabaseError('Choose an image no larger than 3 MB.', 400);
  }

  const image = Buffer.from(encodedImage, 'base64');
  if (image.length === 0 || image.length > MAX_GALLERY_IMAGE_SIZE || image.toString('base64') !== encodedImage) {
    throw new DatabaseError('The photo upload is invalid or exceeds 3 MB.', 400);
  }
  const validSignature = mimeType === 'image/jpeg'
    ? image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
    : mimeType === 'image/png'
      ? image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : image.length >= 12 &&
        image.toString('ascii', 0, 4) === 'RIFF' &&
        image.toString('ascii', 8, 12) === 'WEBP';
  if (!validSignature) throw new DatabaseError('The photo content does not match its image type.', 400);

  return { mimeType, encodedImage, image };
}

function authorize(operation: string, user: SessionUser) {
  let allowed: Role[] = STAFF_ROLES;
  if (operation === 'overview.load' || operation === 'announcements.list' || operation === 'claims.list' || operation === 'programs.active') allowed = [...STAFF_ROLES, 'member'];
  if (operation === 'policy.load' || operation === 'policy.download') allowed = [...STAFF_ROLES, 'member'];
  if (operation === 'policy.save') allowed = POLICY_MANAGEMENT_ROLES;
  if (operation === 'gallery.add' || operation === 'gallery.delete') allowed = ['secretary', 'deputy-secretary'];
  if (operation === 'gallery.founder.save' || operation === 'gallery.founder.delete') allowed = ['secretary', 'deputy-secretary'];
  if (operation === 'finance.memberSummary' || operation === 'finance.controls.load' ||
      operation === 'transactions.list') allowed = STAFF_ROLES;
  if (operation === 'finance.openingBalance.save') allowed = FINANCE_CONTROL_ROLES;
  if (operation === 'committee.markDeceased' || operation === 'members.markDeceased') allowed = GOVERNANCE_ROLES;
  if ([
    'dependants.list', 'dependants.activeForMember', 'dependants.save',
    'beneficiaries.list', 'beneficiaries.activeForMember', 'beneficiaries.save',
  ].includes(operation)) {
    allowed = [...STAFF_ROLES, 'member'];
  }
  if (operation === 'claims.create') allowed = [...STAFF_ROLES, 'member'];
  if (operation === 'dependants.delete' || operation === 'beneficiaries.delete' || operation === 'members.delete') {
    allowed = GOVERNANCE_ROLES;
  }
  if (operation === 'members.list' || operation === 'members.detail') allowed = [...STAFF_ROLES, 'member'];
  if (operation === 'transactions.save') allowed = FINANCE_RECORDING_ROLES;
  if (operation === 'transactions.delete') allowed = ['super-administrator', 'chairperson'];
  if (operation.startsWith('announcements.') && operation !== 'announcements.list') {
    allowed = ANNOUNCEMENT_MANAGEMENT_ROLES;
  }
  if (operation.startsWith('settings.')) allowed = STAFF_ROLES;
  if (operation === 'settings.save') allowed = SOCIETY_SETTINGS_ROLES;
  if (operation.startsWith('users.') || operation === 'roles.list') allowed = ['super-administrator'];
  if (operation === 'members.save') allowed = MEMBER_MANAGEMENT_ROLES;
  if (operation === 'claims.setStatus' || operation === 'programs.save') allowed = GOVERNANCE_ROLES;
  if (operation === 'claims.pay') allowed = FINANCE_RECORDING_ROLES;
  if (!allowed.includes(user.role)) throw new DatabaseError('You do not have permission to perform this operation.', 403);
}

async function handle(operation: string, input: Input, user: SessionUser): Promise<unknown> {
  switch (operation) {
    case 'overview.load': {
      if (user.role === 'member') {
        const [announcements, setting, dependants, beneficiaries, member] = await Promise.all([
          execute(sql.listAnnouncements),
          one<{ setting_value: number }>(
            "SELECT setting_value FROM society_settings WHERE setting_key = 'waitingPeriodMonths'",
          ),
          execute(sql.listDependants, [user.memberId]),
          execute(sql.listBeneficiaries, [user.memberId]),
          one<{ id: string; status: string }>('SELECT id, status FROM members WHERE id = ?', [user.memberId]),
        ]);
        if (!setting || !member) throw new DatabaseError('The main-member account or society settings are unavailable.', 503);
        return {
          members: [],
          transactions: [],
          openClaims: [],
          announcements: rows(await announcements),
          waitingPeriodMonths: Number(setting.setting_value),
          openingBalance: null,
          memberId: member.id,
          dependants: withEligibility(rows<Record<string, unknown>>(await dependants)),
          beneficiaries: rows(await beneficiaries),
        };
      }
      const [members, transactions, openClaims, announcements] = await Promise.all([
        execute(sql.overviewMembers),
        execute(sql.listTransactions),
        execute(sql.overviewOpenClaims),
        execute(sql.listAnnouncements),
      ]);
      const [waitingPeriod, openingBalance] = await Promise.all([
        one<{ setting_value: number }>(
        "SELECT setting_value FROM society_settings WHERE setting_key = 'waitingPeriodMonths'",
        ),
        one<{ opening_balance: number; effective_month: string | Date }>(sql.openingBalance),
      ]);
      if (!waitingPeriod) throw new DatabaseError('Society settings have not been initialized.', 503);
      const [personalDependants, personalBeneficiaries] = user.memberId
        ? await Promise.all([
          execute(sql.listDependants, [user.memberId]),
          execute(sql.listBeneficiaries, [user.memberId]),
        ])
        : [null, null];
      return {
        members: rows(await members),
        transactions: rows<Record<string, unknown>>(transactions).map(withMember),
        openClaims: rows(await openClaims),
        announcements: rows(await announcements),
        waitingPeriodMonths: Number(waitingPeriod.setting_value),
        openingBalance: openingBalance
          ? {
            amount: Number(openingBalance.opening_balance),
            effectiveMonth: dateOnly(openingBalance.effective_month).slice(0, 7),
          }
          : null,
        ...(user.memberId ? {
          memberId: user.memberId,
          dependants: withEligibility(
            rows<Record<string, unknown>>(personalDependants),
          ),
          beneficiaries: rows<Record<string, unknown>>(personalBeneficiaries),
        } : {}),
      };
    }
    case 'policy.load': {
      const policy = await one<{
        document_name: string | null;
        document_mime_type: string | null;
        document_size: number | null;
        updated_by_role: Role;
        updated_at: string;
      }>(sql.policyLoad);
      if (!policy) throw new DatabaseError('The society policy has not been initialized.', 503);
      return policy;
    }
    case 'policy.download': {
      const document = await one<{
        document_name: string | null;
        document_mime_type: string | null;
        document_base64: string | null;
      }>(sql.policyDocument);
      if (!document?.document_name || !document.document_mime_type || !document.document_base64) {
        throw new DatabaseError('The society policy document is not available.', 404);
      }
      return document;
    }
    case 'policy.save': {
      const submittedName = text(input, 'fileName') as string;
      const fileName = submittedName
        .replace(/[\\/]/g, '_')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 255);
      const extension = fileName.toLowerCase().split('.').pop();
      const mimeType = extension === 'pdf'
        ? 'application/pdf'
        : extension === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : null;
      const encodedDocument = text(input, 'documentBase64') as string;
      if (!fileName || !mimeType || encodedDocument.length > Math.ceil(MAX_POLICY_DOCUMENT_SIZE / 3) * 4) {
        throw new DatabaseError('Choose a PDF or DOCX policy file no larger than 8 MB.', 400);
      }
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedDocument)) {
        throw new DatabaseError('The policy document upload is invalid.', 400);
      }
      const document = Buffer.from(encodedDocument, 'base64');
      if (
        document.length === 0 ||
        document.length > MAX_POLICY_DOCUMENT_SIZE ||
        document.toString('base64') !== encodedDocument ||
        (mimeType === 'application/pdf' && !document.subarray(0, 5).equals(Buffer.from('%PDF-'))) ||
        (mimeType.endsWith('wordprocessingml.document') &&
          !document.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
      ) {
        throw new DatabaseError('The selected file is not a valid PDF or DOCX document.', 400);
      }
      await execute(sql.policySave, [fileName, mimeType, document.length, encodedDocument, user.role]);
      return { saved: true };
    }
    case 'members.list':
      if (user.role === 'member') {
        if (!user.memberId) throw new DatabaseError('This account is not linked to a main member.', 403);
        return rows(await execute(sql.listMemberById, [user.memberId]));
      }
      try {
        const [memberResult, accountResult] = await Promise.all([
          execute(sql.listMembers),
          execute(sql.listUsers),
        ]);
        const protectedMemberIds = new Set(
          rows<Record<string, unknown>>(accountResult)
            .filter((account) => account.role === 'super-administrator' && typeof account.member_id === 'string')
            .map((account) => account.member_id as string),
        );
        return rows<Record<string, unknown>>(memberResult)
          .filter((member) => !protectedMemberIds.has(String(member.id)));
      } catch (primaryError) {
        console.warn('Primary member-list query failed; using the compatible member lookup.', primaryError);
        const [memberSnapshots, accounts] = await Promise.all([
          execute(sql.overviewMembers),
          execute(sql.listUsers),
        ]);
        const protectedMemberIds = new Set(
          rows<Record<string, unknown>>(accounts)
            .filter((account) => account.role === 'super-administrator' && typeof account.member_id === 'string')
            .map((account) => account.member_id as string),
        );
        const memberIds = rows<{ id: string }>(memberSnapshots)
          .map((member) => member.id)
          .filter((id) => !protectedMemberIds.has(id));
        const memberRows = await Promise.all(
          memberIds.map((id) => one<Record<string, unknown>>(sql.memberById, [id])),
        );
        return memberRows
          .filter((member): member is Record<string, unknown> => member !== null)
          .map(({ id, member_number, full_name, first_name, surname, email, phone, alternate_phone,
            address, date_joined, status, monthly_contribution, notes, created_at }) => ({
            id, member_number, full_name, first_name, surname, email, phone, alternate_phone,
            address, date_joined, status, monthly_contribution, notes, created_at,
          }));
      }
    case 'members.activeOptions':
      return rows(await execute(sql.activeMembers));
    case 'members.claimOptions':
      return rows(await execute(sql.claimMembers));
    case 'finance.memberSummary': {
      const [activeMembers, memberSnapshots, users] = await Promise.all([
        execute(sql.activeMembers),
        execute(sql.overviewMembers),
        execute(sql.listUsers),
      ]);
      const superAdministratorMemberIds = new Set(
        rows<Record<string, unknown>>(users)
          .filter((account) => account.role === 'super-administrator' && typeof account.member_id === 'string')
          .map((account) => account.member_id as string),
      );
      const contributionsByMember = new Map(
        rows<{ id: string; monthly_contribution: number }>(memberSnapshots)
          .map((member) => [member.id, Number(member.monthly_contribution)]),
      );
      const members = rows<{ id: string; full_name: string; member_number: string }>(activeMembers)
        .filter((member) => !superAdministratorMemberIds.has(member.id))
        .map((member) => ({
          ...member,
          monthly_contribution: contributionsByMember.get(member.id) ?? 0,
        }));
      return { members, excludedMemberIds: Array.from(superAdministratorMemberIds) };
    }
    case 'finance.controls.load': {
      const openingBalance = await one<{ opening_balance: number; effective_month: string | Date }>(sql.openingBalance);
      return {
        openingBalance: openingBalance
          ? {
            amount: Number(openingBalance.opening_balance),
            effectiveMonth: dateOnly(openingBalance.effective_month).slice(0, 7),
          }
          : null,
      };
    }
    case 'members.detail': {
      const id = text(input, 'id') as string;
      if (user.role === 'member' && user.memberId !== id) {
        throw new DatabaseError('You can only view your own main-member record.', 403);
      }
      if (user.role === 'member') {
        const [member, dependants, beneficiaries, waitingSetting, protectedMember] = await Promise.all([
          one<Record<string, unknown>>(sql.memberById, [id]),
          execute(sql.listDependants, [id]),
          execute(sql.listBeneficiaries, [id]),
          one<{ setting_value: number }>(
            "SELECT setting_value FROM society_settings WHERE setting_key = 'waitingPeriodMonths'",
          ),
          one(sql.superAdministratorMember, [id]),
        ]);
        if (!member || protectedMember) return null;
        if (!waitingSetting) throw new DatabaseError('Society settings have not been initialized.', 503);
        const { id_number: _mainMemberIdNumber, ...memberProfile } = member;
        return {
          member: memberProfile,
          dependants: withEligibility(
            rows<Record<string, unknown>>(await dependants),
          ),
          beneficiaries: rows(await beneficiaries),
        };
      }
      const [member, dependants, beneficiaries, claims, transactions, waitingSetting, protectedMember] = await Promise.all([
        one<Record<string, unknown>>(sql.memberById, [id]),
        execute(sql.listDependants, [id]),
        execute(sql.listBeneficiaries, [id]),
        execute(sql.claimsForMember, [id]),
        execute(sql.transactionsForMember, [id]),
        one<{ setting_value: number }>(
          "SELECT setting_value FROM society_settings WHERE setting_key = 'waitingPeriodMonths'",
        ),
        one(sql.superAdministratorMember, [id]),
      ]);
      if (!member || protectedMember) return null;
      if (!waitingSetting) throw new DatabaseError('Society settings have not been initialized.', 503);
      const { id_number: memberIdNumber, ...memberProfile } = member;
      const dependantRows = withEligibility(
        rows<Record<string, unknown>>(await dependants),
      );
      return {
        member: MEMBER_MANAGEMENT_ROLES.includes(user.role)
          ? { ...memberProfile, id_number: memberIdNumber }
          : memberProfile,
        dependants: dependantRows,
        beneficiaries: rows(await beneficiaries),
        claims: rows<Record<string, unknown>>(await claims).map(withClaimRelations),
        transactions: rows<Record<string, unknown>>(await transactions).map(withMember),
      };
    }
    case 'members.delete': {
      const id = text(input, 'id') as string;
      const member = await one<Record<string, unknown>>(sql.memberById, [id]);
      if (!member) throw new DatabaseError('The member could not be found.', 404);
      if (await one(sql.superAdministratorMember, [id])) {
        throw new DatabaseError('The protected system account cannot be deleted from the member register.', 403);
      }
      await execute(sql.deleteMember, [id]);
      return { deleted: true };
    }
    case 'members.markDeceased': {
      const id = text(input, 'id') as string;
      const member = await one<Record<string, unknown>>(sql.memberById, [id]);
      if (!member) throw new DatabaseError('The member could not be found.', 404);
      if (await one(sql.superAdministratorMember, [id])) {
        throw new DatabaseError('The protected system account cannot be marked deceased.', 403);
      }
      if (member.deceased_at) throw new DatabaseError('This member is already recorded deceased.', 409);
      await execute(sql.markMemberDeceased, [id]);
      const updated = await one<{ deceased_at: string | Date | null }>(sql.memberById, [id]);
      if (!updated?.deceased_at) throw new DatabaseError('The member could not be marked deceased. Refresh and try again.', 409);
      await execute(sql.disableUserForMember, [id]);
      await execute(sql.revokeMemberSessions, [id]);
      return { saved: true };
    }
    case 'members.save': {
      const existing = text(input, 'id', false);
      const id = existing ?? randomUUID();
      const firstName = (text(input, 'first_name') as string).trim();
      const surname = (text(input, 'surname') as string).trim();
      const idNumber = normalizeIdNumber(text(input, 'id_number') as string);
      const fullName = `${firstName} ${surname}`;
      const email = text(input, 'email', false)?.trim().toLowerCase() ?? null;
      const phone = text(input, 'phone', false)?.trim() ?? null;
      const alternatePhone = text(input, 'alternate_phone', false)?.trim() ?? null;
      const address = text(input, 'address', false)?.trim() ?? null;
      const dateJoined = text(input, 'date_joined') as string;
      const status = choice(input, 'status', ['active', 'inactive', 'suspended'] as const);
      const monthly = money(input, 'monthly_contribution', 0);
      const notes = text(input, 'notes', false);
      if (!firstName || !surname || firstName.length > 100 || surname.length > 100 || fullName.length > 200 ||
          !isValidIdNumber(idNumber)) {
        throw new DatabaseError('Enter a valid first name, surname, and 13-digit ID number.', 400);
      }
      if (!isValidIsoDate(dateJoined)) throw new DatabaseError('Enter a valid member join date.', 400);
      if (!phone || phone.length > 40 || (alternatePhone && alternatePhone.length > 40)) {
        throw new DatabaseError('Enter a valid contact number and, if provided, an alternative number.', 400);
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new DatabaseError('Enter a valid email address.', 400);
      }
      const duplicateId = await one(sql.memberIdentityExists, [idNumber, id]);
      if (duplicateId) throw new DatabaseError('A member with this ID number already exists.', 409);
      if (email && await one(sql.userEmailExists, [email, id])) {
        throw new DatabaseError('This email address is already associated with another account.', 409);
      }

      if (existing) {
        const previous = await one<Record<string, unknown>>(sql.memberById, [existing]);
        if (!previous) throw new DatabaseError('The member could not be found.', 404);
        if (previous.deceased_at) {
          throw new DatabaseError('A member recorded deceased cannot be edited or reactivated.', 403);
        }
        if (await one(sql.superAdministratorMember, [existing])) {
          throw new DatabaseError('This protected system account cannot be changed from a member record.', 403);
        }
        await execute(sql.updateMember, [
          fullName, firstName, surname, idNumber, email, phone, alternatePhone, address,
          dateJoined, status, monthly, notes, existing,
        ]);
        await execute(sql.updateMemberUser, [fullName, email, phone, idNumber, status === 'active', existing]);
        if (status !== 'active') {
          await execute(sql.disableMemberUser, [existing, status]);
          await execute(sql.revokeMemberSessions, [existing]);
        }
        if (previous.id_number !== idNumber) await execute(sql.revokeMemberSessions, [existing]);
      } else {
        const password = text(input, 'password') as string;
        const confirmPassword = text(input, 'confirm_password') as string;
        if (password.length < 12 || password.length > 128) {
          throw new DatabaseError('Member passwords must be between 12 and 128 characters.', 400);
        }
        if (password !== confirmPassword) {
          throw new DatabaseError('The password and confirmation do not match.', 400);
        }
        const sequence = await one<{ sequence_number: number }>(sql.nextMemberNumber);
        if (!sequence) throw new DatabaseError('Could not allocate a member number.', 502);
        const memberNumber = `XS-${String(sequence.sequence_number).padStart(4, '0')}`;
        await execute(sql.insertMember, [
          id, memberNumber, fullName, firstName, surname, idNumber, email, phone, alternatePhone,
          address, dateJoined, status, monthly, notes,
        ]);
        try {
          const memberUserId = randomUUID();
          await execute(sql.insertMemberUser, [
            memberUserId, id, idNumber, fullName, email, phone, await hashPassword(password), status === 'active',
          ]);
          await execute(sql.assignRole, [memberUserId, 'member']);
        } catch (error) {
          try {
            await execute('DELETE FROM users WHERE member_id = ?', [id]);
            await execute('DELETE FROM members WHERE id = ?', [id]);
          } catch {
            throw new DatabaseError('Member account creation failed and the member record could not be rolled back.', 502);
          }
          throw error;
        }
      }
      return one(sql.memberById, [id]);
    }
    case 'transactions.list':
      return rows<Record<string, unknown>>(await execute(sql.listTransactions)).map(withMember);
    case 'transactions.save': {
      const occurredOn = text(input, 'occurred_on') as string;
      const kind = choice(input, 'kind', ['contribution', 'joining_fee', 'donation', 'fine', 'other_income', 'expense'] as const);
      const memberId = text(input, 'member_id', false);
      if (!isValidIsoDate(occurredOn)) throw new DatabaseError('Enter a valid transaction date.', 400);
      if (kind === 'fine' && !memberId) {
        throw new DatabaseError('Select the member who paid this fine.', 400);
      }
      await execute(sql.insertTransaction, [
        kind,
        money(input, 'amount', 0.01),
        text(input, 'description') as string,
        text(input, 'category', false),
        text(input, 'reference', false),
        occurredOn,
        memberId,
        null,
        user.role,
      ]);
      return { saved: true };
    }
    case 'transactions.delete':
      await execute(sql.deleteTransaction, [text(input, 'id')]);
      return { deleted: true };
    case 'dependants.list':
    case 'dependants.activeForMember':
    case 'beneficiaries.list':
    case 'beneficiaries.activeForMember': {
      const requestedMemberId = text(input, 'member_id') as string;
      const memberId = user.role === 'member' ? user.memberId : requestedMemberId;
      if (!memberId || (user.role === 'member' && requestedMemberId !== memberId)) {
        throw new DatabaseError('You can only view related people for your own main-member record.', 403);
      }
      const isDependant = operation.startsWith('dependants.');
      const isActiveOnly = operation.endsWith('activeForMember');
      const relatedPeople = await execute(
        isDependant
          ? isActiveOnly ? sql.activeDependants : sql.listDependants
          : isActiveOnly ? sql.activeBeneficiaries : sql.listBeneficiaries,
        [memberId],
      );
      const people = rows<Record<string, unknown>>(relatedPeople);
      if (!isDependant) return people;
      const setting = await one<{ setting_value: number }>(
        "SELECT setting_value FROM society_settings WHERE setting_key = 'waitingPeriodMonths'",
      );
      if (!setting) throw new DatabaseError('Society settings have not been initialized.', 503);
      return withEligibility(people);
    }
    case 'dependants.save':
    case 'beneficiaries.save': {
      const requestedMemberId = text(input, 'member_id') as string;
      const memberId = user.role === 'member' ? user.memberId : requestedMemberId;
      if (!memberId || (user.role === 'member' && requestedMemberId !== memberId)) {
        throw new DatabaseError('You can only manage related people for your own main-member record.', 403);
      }
      const isDependant = operation === 'dependants.save';
      const label = isDependant ? 'dependant' : 'beneficiary';
      const table = isDependant ? 'dependants' : 'beneficiaries';
      const id = text(input, 'id', false);
      if (user.role === 'member' && id) {
        throw new DatabaseError(`Main members can add ${label}s but cannot edit existing records.`, 403);
      }
      const firstName = (text(input, 'first_name') as string).trim();
      const surname = (text(input, 'surname') as string).trim();
      const idNumber = normalizeIdNumber(text(input, 'id_number') as string);
      const fullName = `${firstName} ${surname}`;
      const relationship = text(input, 'relationship') as string;
      const dateOfBirth = text(input, 'date_of_birth', false);
      const phone = text(input, 'phone', false);
      const share = number(input, 'share_percent', 0.01);
      if (share > 100) throw new DatabaseError('Invalid share_percent.', 400);
      const isActive = user.role === 'member' ? true : boolean(input, 'is_active', true);
      const savedId = id ?? randomUUID();
      if (
        !firstName ||
        !surname ||
        firstName.length > 100 ||
        surname.length > 100 ||
        fullName.length > 200 ||
        !isValidIdNumber(idNumber)
      ) {
        throw new DatabaseError('Enter the beneficiary’s first name, surname, and 13-digit ID number.', 400);
      }
      const duplicateId = await one(
        isDependant ? sql.dependantIdExists : sql.beneficiaryIdExists,
        [idNumber, id ?? ''],
      );
      if (duplicateId) throw new DatabaseError(`A ${label} with this ID number already exists.`, 409);

      const mainMember = await one<{ status: string }>('SELECT status FROM members WHERE id = ?', [memberId]);
      if (!mainMember || mainMember.status !== 'active') {
        throw new DatabaseError('An active main-member account is required to manage related people.', 403);
      }

      const existing = id
        ? await one<{ is_active: boolean | number; deceased_at: string | null }>(
          isDependant ? sql.dependantActiveState : sql.beneficiaryActiveState,
          [id, memberId],
        )
        : null;
      if (id && !existing) throw new DatabaseError(`The ${label} could not be found under this main member.`, 404);
      if (existing?.deceased_at) {
        throw new DatabaseError(`A deceased ${label} record cannot be edited or reactivated.`, 409);
      }
      if (isActive && existing && !Boolean(Number(existing.is_active))) {
        throw new DatabaseError(`A removed ${label} cannot be reactivated. Add a new record instead.`, 409);
      }

      if (isDependant && isActive) {
        const countRow = await one<{ active_count: number }>(sql.activeDependantCount, [memberId]);
        const alreadyActive = existing ? Boolean(Number(existing.is_active)) : false;
        if (!alreadyActive && Number(countRow?.active_count ?? 0) >= MAX_ACTIVE_DEPENDANTS) {
          throw new DatabaseError(`A main member can have up to ${MAX_ACTIVE_DEPENDANTS} active dependants.`, 409);
        }
      }
      if (id) {
        await execute(
          isDependant ? sql.updateDependant : sql.updateBeneficiary,
          [
          fullName, firstName, surname, idNumber, relationship, dateOfBirth, phone, share, isActive, id, memberId,
          ],
        );
      } else {
        await execute(isDependant ? sql.insertDependant : sql.insertBeneficiary, [
          savedId, memberId, fullName, firstName, surname, idNumber, relationship, dateOfBirth, phone, share, isActive,
        ]);
      }
      const saved = await one<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, [savedId]);
      if (!saved) throw new DatabaseError(`The ${label} was saved but could not be reloaded.`, 502);
      if (!isDependant) return saved;
      const setting = await one<{ setting_value: number }>(
        "SELECT setting_value FROM society_settings WHERE setting_key = 'waitingPeriodMonths'",
      );
      if (!setting) throw new DatabaseError('Society settings have not been initialized.', 503);
      return withEligibility([saved])[0];
    }
    case 'dependants.delete':
    case 'beneficiaries.delete': {
      const isDependant = operation === 'dependants.delete';
      const table = isDependant ? 'dependants' : 'beneficiaries';
      const id = text(input, 'id') as string;
      const deceased = boolean(input, 'deceased');
      const result = await one<{ id: string; member_id: string }>(
        `SELECT id, member_id FROM ${table} WHERE id = ? AND is_active = TRUE AND deceased_at IS NULL`,
        [id],
      );
      if (!result) throw new DatabaseError(`The active ${isDependant ? 'dependant' : 'beneficiary'} could not be found.`, 404);
      await execute(isDependant ? sql.retireDependant : sql.retireBeneficiary, [deceased, id]);
      return { removed: true, deceased, member_id: result.member_id };
    }
    case 'programs.list':
      return rows(await execute(sql.listPrograms));
    case 'programs.active':
      return rows(await execute(sql.activePrograms));
    case 'programs.save': {
      const id = text(input, 'id', false);
      const name = text(input, 'name') as string;
      const description = text(input, 'description', false);
      const amount = money(input, 'benefit_amount', 0);
      const frequency = choice(input, 'frequency', ['one_time', 'monthly', 'quarterly', 'annual'] as const);
      const eligibility = text(input, 'eligibility', false);
      const isActive = boolean(input, 'is_active', true);
      if (id) {
        await execute(sql.updateProgram, [name, description, amount, frequency, eligibility, isActive, id]);
      } else {
        await execute(sql.insertProgram, [randomUUID(), name, description, amount, frequency, eligibility, isActive]);
      }
      return { saved: true };
    }
    case 'claims.list':
      if (user.role === 'member') {
        if (!user.memberId) throw new DatabaseError('This account is not linked to a main member.', 403);
        return rows<Record<string, unknown>>(await execute(sql.claimsForMember, [user.memberId])).map(withClaimRelations);
      }
      return rows<Record<string, unknown>>(await execute(sql.listClaims)).map(withClaimRelations);
    case 'claims.create':
      {
        const requestedMemberId = text(input, 'member_id') as string;
        const memberId = user.role === 'member' ? user.memberId : requestedMemberId;
        if (!memberId || (user.role === 'member' && requestedMemberId !== memberId)) {
          throw new DatabaseError('Main members can only create claims under their own account.', 403);
        }
        const member = await one<{ date_joined: string | Date; status: string; deceased_at: string | Date | null }>(
          'SELECT date_joined, status, deceased_at FROM members WHERE id = ?',
          [memberId],
        );
        if (!member) throw new DatabaseError('The member could not be found.', 404);
        const programId = text(input, 'program_id') as string;
        const program = await one<{ benefit_amount: number }>(sql.activeProgramAmount, [programId]);
        if (!program) throw new DatabaseError('The active benefit program could not be found.', 404);
        const claimAmount = money(input, 'amount', 0.01);
        if (claimAmount > Number(program.benefit_amount)) {
          throw new DatabaseError('The claim amount exceeds the benefit program limit.', 400);
        }
        const dependantId = text(input, 'dependant_id', false);
        const deathBeneficiaryId = text(input, 'death_beneficiary_id', false);
        if (dependantId && deathBeneficiaryId) {
          throw new DatabaseError('Choose a covered dependant or a death beneficiary, not both.', 400);
        }
        const waitingSetting = await one<{ setting_value: number }>(
          "SELECT setting_value FROM society_settings WHERE setting_key = 'waitingPeriodMonths'",
        );
        if (!waitingSetting) throw new DatabaseError('Society settings have not been initialized.', 503);
        const waitingMonths = Number(waitingSetting.setting_value);
        if (!Number.isInteger(waitingMonths) || waitingMonths < 0 || waitingMonths > 24) {
          throw new DatabaseError('The configured waiting period is invalid.', 503);
        }
        const memberEligibleOn = addCalendarMonths(dateOnly(member.date_joined), waitingMonths);
        if (deathBeneficiaryId) {
          if (!member.deceased_at) {
            throw new DatabaseError('A death beneficiary can only claim after the main member has been recorded deceased.', 400);
          }
          if (memberEligibleOn > dateOnly(member.deceased_at)) {
            throw new DatabaseError('The main member had not completed the waiting period on the date of death.', 400);
          }
          if (!await one(sql.activeMemberBeneficiary, [deathBeneficiaryId, memberId])) {
            throw new DatabaseError('The selected death beneficiary is not active for this main member.', 400);
          }
        } else {
          if (member.status !== 'active' || member.deceased_at) {
            throw new DatabaseError('Only a living, active main member can submit a personal or dependant claim.', 400);
          }
          if (memberEligibleOn > dateToday()) {
            throw new DatabaseError(`This member has not completed the ${waitingMonths}-month waiting period.`, 400);
          }
          if (dependantId) {
            const dependant = await one<{ created_at: string | Date }>(
              'SELECT created_at FROM dependants WHERE id = ? AND member_id = ? AND is_active = TRUE AND deceased_at IS NULL',
              [dependantId, memberId],
            );
            if (!dependant) throw new DatabaseError('The selected dependant is not active for this main member.', 400);
            const dependantEligibleOn = addCalendarMonths(dateOnly(dependant.created_at), 6);
            if (dependantEligibleOn > dateToday()) {
              throw new DatabaseError(`This dependant must complete the six-month waiting period before receiving benefits.`, 400);
            }
          }
        }
        await execute(sql.insertClaim, [
          randomUUID(),
          memberId,
          dependantId,
          deathBeneficiaryId,
          programId,
          claimAmount,
          text(input, 'reason', false),
          dateToday(),
        ]);
      }
      return { saved: true };
    case 'claims.setStatus':
      await execute(sql.updateClaimStatus, [
        choice(input, 'status', ['approved', 'rejected'] as const),
        dateToday(),
        text(input, 'id'),
      ]);
      return { saved: true };
    case 'claims.pay': {
      const claimId = text(input, 'id') as string;
      const claim = await one<{
        id: string;
        member_id: string;
        dependant_id: string | null;
        death_beneficiary_id: string | null;
        amount: number;
        program_name: string | null;
        status: string;
        date_joined: string | Date;
        member_status: string;
        deceased_at: string | Date | null;
        member_full_name: string;
        beneficiary_full_name: string | null;
        dependant_full_name: string | null;
      }>(
        `SELECT c.id, c.member_id, c.dependant_id, c.death_beneficiary_id, c.amount,
          p.name AS program_name, c.status, m.date_joined, m.status AS member_status, m.deceased_at,
          m.full_name AS member_full_name, b.full_name AS beneficiary_full_name, d.full_name AS dependant_full_name
         FROM benefit_claims c LEFT JOIN benefit_programs p ON p.id = c.program_id
         JOIN members m ON m.id = c.member_id
         LEFT JOIN beneficiaries b ON b.id = c.death_beneficiary_id
         LEFT JOIN dependants d ON d.id = c.dependant_id WHERE c.id = ?`,
        [claimId],
      );
      if (!claim) throw new DatabaseError('The claim could not be found.', 404);
      if (claim.status !== 'approved') throw new DatabaseError('Only approved claims can be paid.', 409);
      const waitingSetting = await one<{ setting_value: number }>(
          "SELECT setting_value FROM society_settings WHERE setting_key = 'waitingPeriodMonths'",
      );
      if (!waitingSetting) throw new DatabaseError('Society settings have not been initialized.', 503);
      const waitingMonths = Number(waitingSetting.setting_value);
      if (!Number.isInteger(waitingMonths) || waitingMonths < 0 || waitingMonths > 24) {
        throw new DatabaseError('The configured waiting period is invalid.', 503);
      }
      if (claim.death_beneficiary_id) {
        if (!claim.deceased_at) throw new DatabaseError('A death-beneficiary claim requires the main member to be recorded deceased.', 409);
        const eligibleOn = addCalendarMonths(dateOnly(claim.date_joined), waitingMonths);
        if (eligibleOn > dateOnly(claim.deceased_at)) {
          throw new DatabaseError('The main member had not completed the waiting period on the date of death.', 409);
        }
        if (!await one(sql.activeMemberBeneficiary, [claim.death_beneficiary_id, claim.member_id])) {
          throw new DatabaseError('This death beneficiary is no longer active for the main member.', 409);
        }
      } else {
        if (claim.member_status !== 'active' || claim.deceased_at) {
          throw new DatabaseError('Only an active main member can receive a personal or dependant claim payout.', 409);
        }
        if (addCalendarMonths(dateOnly(claim.date_joined), waitingMonths) > dateToday()) {
          throw new DatabaseError('The main member has not completed the waiting period.', 409);
        }
        if (claim.dependant_id) {
          const dependant = await one<{ created_at: string | Date }>(
            `SELECT created_at FROM dependants
             WHERE id = ? AND member_id = ? AND is_active = TRUE AND deceased_at IS NULL`,
            [claim.dependant_id, claim.member_id],
          );
          if (!dependant) throw new DatabaseError('This dependant is no longer active for the main member.', 409);
          if (addCalendarMonths(dateOnly(dependant.created_at), 6) > dateToday()) {
            throw new DatabaseError('The dependant has not completed the six-month waiting period.', 409);
          }
        }
      }
      const today = dateToday();
      const payee = claim.beneficiary_full_name ?? claim.member_full_name;
      const dependantDetail = claim.dependant_full_name ? ` for dependant ${claim.dependant_full_name}` : '';
      await execute(sql.insertPayout, [
        claim.amount,
        `Benefit payout: ${claim.program_name ?? 'Benefit'} — paid to ${payee}${dependantDetail}`,
        today,
        claim.member_id,
        claim.id,
      ]);
      await execute(sql.markClaimPaid, [today, claim.id]);
      return { saved: true };
    }
    case 'announcements.list':
      return rows(await execute(sql.listAnnouncements));
    case 'announcements.create':
      await execute(sql.insertAnnouncement, [
        randomUUID(),
        text(input, 'title') as string,
        text(input, 'body') as string,
        choice(input, 'severity', ['notice', 'important', 'urgent'] as const),
        text(input, 'expires_on', false),
        user.role,
      ]);
      return { saved: true };
    case 'announcements.archive':
      await execute(sql.archiveAnnouncement, [text(input, 'id')]);
      return { archived: true };
    case 'settings.load': {
      const storedSettings = await execute(sql.loadSettings);
      const settings = rows<{ setting_key: string; setting_value: number }>(storedSettings);
      const result = Object.fromEntries(settings.map(({ setting_key, setting_value }) => [setting_key, Number(setting_value)]));
      if (
        typeof result.joiningFee !== 'number' ||
        typeof result.defaultMonthlyContribution !== 'number' ||
        typeof result.waitingPeriodMonths !== 'number'
      ) {
        throw new DatabaseError('Society settings have not been initialized.', 503);
      }
      return result;
    }
    case 'settings.save': {
      const joiningFee = money(input, 'joiningFee', 0);
      const monthly = money(input, 'defaultMonthlyContribution', 0);
      const waiting = number(input, 'waitingPeriodMonths', 0);
      if (!Number.isInteger(waiting) || waiting > 24) throw new DatabaseError('Invalid waitingPeriodMonths.', 400);
      await execute(sql.saveSettings, [joiningFee, monthly, waiting]);
      const [memberSnapshots, accounts] = await Promise.all([
        execute(sql.overviewMembers),
        execute(sql.listUsers),
      ]);
      const protectedMemberIds = new Set(
        rows<Record<string, unknown>>(accounts)
          .filter((account) => account.role === 'super-administrator' && typeof account.member_id === 'string')
          .map((account) => account.member_id as string),
      );
      for (const snapshot of rows<{ id: string }>(memberSnapshots)) {
        if (protectedMemberIds.has(snapshot.id)) continue;
        const member = await one<Record<string, unknown>>(sql.memberById, [snapshot.id]);
        if (!member) throw new DatabaseError('A member record could not be loaded while applying the monthly contribution setting.', 502);
        await execute(sql.updateMember, [
          member.full_name,
          member.first_name,
          member.surname,
          member.id_number,
          member.email,
          member.phone,
          member.alternate_phone,
          member.address,
          member.date_joined,
          member.status,
          monthly,
          member.notes,
          member.id,
        ]);
      }
      return { saved: true };
    }
    case 'gallery.add': {
      const caption = (text(input, 'caption', false) ?? '').trim();
      const { mimeType, encodedImage, image } = galleryImage(input);
      if (caption.length > 180) throw new DatabaseError('Captions must be no more than 180 characters.', 400);

      const count = await one<{ photo_count: number }>('SELECT COUNT(*) AS photo_count FROM society_gallery');
      if (Number(count?.photo_count ?? 0) >= 100) {
        throw new DatabaseError('The society gallery can contain up to 100 photos.', 409);
      }
      await execute(
        'INSERT INTO society_gallery (id, caption, mime_type, image_size, image_data, published_by_role) VALUES (?, ?, ?, ?, FROM_BASE64(?), ?)',
        [randomUUID(), caption, mimeType, image.length, encodedImage, user.role],
      );
      return { added: true };
    }
    case 'gallery.founder.save': {
      const { mimeType, encodedImage, image } = galleryImage(input);
      await execute(
        `INSERT INTO society_founder_photo (id, mime_type, image_size, image_data, updated_by_role)
         VALUES (1, ?, ?, FROM_BASE64(?), ?)
         ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), image_size = VALUES(image_size),
           image_data = VALUES(image_data), updated_by_role = VALUES(updated_by_role)`,
        [mimeType, image.length, encodedImage, user.role],
      );
      return { saved: true };
    }
    case 'gallery.founder.delete': {
      if (!(await one('SELECT mime_type FROM society_founder_photo WHERE id = 1'))) {
        throw new DatabaseError('The founder portrait has not been published.', 404);
      }
      await execute('DELETE FROM society_founder_photo WHERE id = 1');
      return { deleted: true };
    }
    case 'gallery.delete': {
      const id = text(input, 'id') as string;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new DatabaseError('The selected photo could not be found.', 404);
      }
      if (!(await one('SELECT id FROM society_gallery WHERE id = ?', [id]))) {
        throw new DatabaseError('The selected photo could not be found.', 404);
      }
      await execute('DELETE FROM society_gallery WHERE id = ?', [id]);
      return { deleted: true };
    }
    case 'finance.openingBalance.save': {
      const amount = signedMoney(input, 'amount');
      const effectiveMonth = monthStart(input, 'effectiveMonth');
      await execute(sql.saveOpeningBalance, [amount, effectiveMonth, user.role]);
      return { saved: true };
    }
    case 'roles.list':
      return rows<Record<string, unknown>>(await execute(sql.listRoles))
        .filter((role) => role.role_key !== 'super-administrator');
    case 'users.list':
      return rows<Record<string, unknown>>(await execute(sql.listUsers))
        .filter((account) => account.role !== 'super-administrator');
    case 'committee.list':
      return rows<Record<string, unknown>>(await execute(sql.committeeRoster));
    case 'committee.markDeceased': {
      const userId = text(input, 'user_id');
      if (!userId) throw new DatabaseError('A committee account must be selected.', 400);
      const account = await one<{ member_id: string | null; deceased_at: string | Date | null; role: string }>(
        sql.committeeAccount,
        [userId],
      );
      if (!account || !['chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary'].includes(account.role)) {
        throw new DatabaseError('The committee member could not be found.', 404);
      }
      if (!account.member_id) {
        throw new DatabaseError('Apply the committee membership migration before recording this person as deceased.', 409);
      }
      if (account.deceased_at) throw new DatabaseError('This committee member is already recorded as deceased.', 409);
      await execute(sql.markCommitteeDeceased, [userId]);
      const updatedAccount = await one<{ deceased_at: string | Date | null }>(sql.committeeAccount, [userId]);
      if (!updatedAccount?.deceased_at) {
        throw new DatabaseError('The committee membership could not be updated. Refresh and try again.', 409);
      }
      await execute(sql.revokeUserSessions, [userId]);
      return { saved: true };
    }
    case 'users.create': {
      const fullName = text(input, 'full_name') as string;
      const loginId = normalizeIdNumber(text(input, 'login_id') as string);
      const contactNumber = text(input, 'contact_number')?.trim() as string;
      const password = text(input, 'password') as string;
      const role = choice(input, 'role', [
        'chairperson', 'deputy-chairperson', 'finance',
        'deputy-finance', 'secretary', 'deputy-secretary',
      ] as const);
      if (!fullName.trim() || fullName.length > 200 ||
          !isValidIdNumber(loginId) || !contactNumber || contactNumber.length > 40) {
        throw new DatabaseError('Enter a valid name, 13-digit ID number, and contact number.', 400);
      }
      const [staffFirstName, ...staffSurnameParts] = fullName.trim().split(/\s+/);
      const staffSurname = staffSurnameParts.join(' ') || staffFirstName;
      if (staffFirstName.length > 100 || staffSurname.length > 100) {
        throw new DatabaseError('The first name and surname must each be no more than 100 characters.', 400);
      }
      if (await one(sql.userLoginIdExists, [loginId, ''])) {
        throw new DatabaseError('An account already uses this ID number.', 409);
      }
      if (password.length < 12 || password.length > 128) {
        throw new DatabaseError('Passwords must be between 12 and 128 characters.', 400);
      }
      if (!(await one(sql.roleExists, [role]))) {
        throw new DatabaseError('The selected role is not configured.', 503);
      }
      const id = randomUUID();
      const memberId = randomUUID();
      const sequence = await one<{ sequence_number: number }>(sql.nextMemberNumber);
      const contributionSetting = await one<{ setting_value: number }>(sql.staffMemberContribution);
      if (!sequence || !contributionSetting) {
        throw new DatabaseError('Member numbering or contribution settings are unavailable.', 503);
      }
      await execute(sql.insertMember, [
        memberId,
        `XS-${String(sequence.sequence_number).padStart(4, '0')}`,
        fullName.trim(),
        staffFirstName,
        staffSurname,
        loginId,
        null,
        contactNumber,
        null,
        null,
        dateToday(),
        'active',
        Number(contributionSetting.setting_value),
        null,
      ]);
      try {
        await execute(sql.insertStaffMemberUser, [
          id, memberId, fullName.trim(), contactNumber, loginId, await hashPassword(password), true,
        ]);
        await execute(sql.assignRole, [id, role]);
      } catch (error) {
        try {
          await execute('DELETE FROM users WHERE id = ?', [id]);
          await execute('DELETE FROM members WHERE id = ?', [memberId]);
        } catch {
          throw new DatabaseError('Staff account creation failed and the member record could not be rolled back.', 502);
        }
        throw error;
      }
      return { created: true };
    }
    case 'users.update': {
      const id = text(input, 'id') as string;
      const fullName = text(input, 'full_name') as string;
      const loginId = normalizeIdNumber(text(input, 'login_id') as string);
      const contactNumber = text(input, 'contact_number')?.trim() as string;
      const password = text(input, 'password', false);
      const role = choice(input, 'role', [
        'chairperson', 'deputy-chairperson', 'finance',
        'deputy-finance', 'secretary', 'deputy-secretary', 'member',
      ] as const);
      const isActive = boolean(input, 'is_active');
      if (id === user.id && password !== null) {
        throw new DatabaseError('Use a separate password-reset process to change your own password.', 400);
      }
      if (!fullName.trim() || fullName.length > 200 ||
          !isValidIdNumber(loginId) || !contactNumber || contactNumber.length > 40) {
        throw new DatabaseError('Enter a valid name, 13-digit ID number, and contact number.', 400);
      }
      const [staffFirstName, ...staffSurnameParts] = fullName.trim().split(/\s+/);
      const staffSurname = staffSurnameParts.join(' ') || staffFirstName;
      if (staffFirstName.length > 100 || staffSurname.length > 100) {
        throw new DatabaseError('The first name and surname must each be no more than 100 characters.', 400);
      }
      if (password !== null && (password.length < 12 || password.length > 128)) {
        throw new DatabaseError('Passwords must be between 12 and 128 characters.', 400);
      }
      if (id === user.id && (!isActive || role !== user.role)) {
        throw new DatabaseError('You cannot disable your own account or change your own role.', 400);
      }
      const account = await one<{ member_id: string | null; login_id: string | null; role_key: string; deceased_at: string | Date | null }>(
        `SELECT u.member_id, u.login_id, r.role_key, m.deceased_at FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         LEFT JOIN members m ON m.id = u.member_id
         WHERE u.id = ? LIMIT 1`,
        [id],
      );
      if (!account) throw new DatabaseError('The account could not be found.', 404);
      if (account.role_key === 'super-administrator') {
        throw new DatabaseError('This protected system account cannot be changed.', 403);
      }
      if (role === 'member' && !account.member_id) {
        throw new DatabaseError('A staff account must be linked to a main member before it can return to the Member role.', 409);
      }
      if (account.deceased_at) {
        throw new DatabaseError('A deceased committee account cannot be reactivated or changed.', 403);
      }
      if (id === user.id && loginId !== account.login_id) {
        throw new DatabaseError('You cannot change your own sign-in ID while signed in.', 400);
      }
      if (await one(sql.userLoginIdExists, [loginId, id])) {
        throw new DatabaseError('An account already uses this ID number.', 409);
      }
      if (!(await one(sql.roleExists, [role]))) {
        throw new DatabaseError('The selected role is not configured.', 503);
      }
      if (password === null) {
        await execute(sql.updateUser, [fullName.trim(), contactNumber, loginId, isActive, id]);
      } else {
        await execute(sql.updateUserPassword, [fullName.trim(), contactNumber, loginId, isActive, await hashPassword(password), id]);
      }
      if (account.member_id) {
        await execute(sql.updateStaffMember, [
          fullName.trim(),
          staffFirstName,
          staffSurname,
          loginId,
          contactNumber,
          account.member_id,
        ]);
      }
      await execute(sql.assignRole, [id, role]);
      if (!isActive || password !== null) await execute(sql.revokeUserSessions, [id]);
      return { saved: true };
    }
    default:
      throw new DatabaseError('Unknown database operation.', 400);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const body = asInput(await request.json());
    const operation = text(body, 'operation') as string;
    const input = asInput(body.input ?? {});
    authorize(operation, user);
    const data = await handle(operation, input, user);
    return NextResponse.json({ data });
  } catch (error) {
    const status = error instanceof DatabaseError ? error.status : 502;
    const message = error instanceof DatabaseError ? error.message : 'The database request failed.';
    return NextResponse.json({ error: message }, { status });
  }
}
