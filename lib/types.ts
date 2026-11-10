import type { Role } from '@/lib/auth';

export type MemberStatus = 'active' | 'inactive' | 'suspended';
export type BenefitFrequency = 'one_time' | 'monthly' | 'quarterly' | 'annual';
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type TransactionKind = 'contribution' | 'joining_fee' | 'donation' | 'fine' | 'other_income' | 'expense' | 'benefit_payout';
export type AnnouncementSeverity = 'notice' | 'important' | 'urgent';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  published_at: string;
  expires_on: string | null;
  is_active: boolean;
  published_by_role?: Role;
}

export interface Member {
  id: string;
  member_number: string;
  full_name: string;
  first_name: string;
  surname: string;
  id_number?: string | null;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  address: string | null;
  date_joined: string;
  status: MemberStatus;
  deceased_at?: string | null;
  monthly_contribution: number;
  notes: string | null;
  created_at: string;
}

export interface Beneficiary {
  id: string;
  member_id: string;
  full_name: string;
  first_name: string;
  surname: string;
  id_number: string | null;
  relationship: string;
  date_of_birth: string | null;
  phone: string | null;
  share_percent: number;
  is_active: boolean;
  deceased_at: string | null;
  created_at: string;
}

export interface Dependant {
  id: string;
  member_id: string;
  full_name: string;
  first_name: string;
  surname: string;
  id_number: string | null;
  relationship: string;
  date_of_birth: string | null;
  phone: string | null;
  share_percent: number;
  is_active: boolean;
  deceased_at: string | null;
  created_at: string;
  eligible_on?: string;
}

export interface BenefitProgram {
  id: string;
  name: string;
  description: string | null;
  benefit_amount: number;
  frequency: BenefitFrequency;
  eligibility: string | null;
  is_active: boolean;
}

export interface BenefitClaim {
  id: string;
  member_id: string;
  dependant_id: string | null;
  death_beneficiary_id: string | null;
  program_id: string;
  amount: number;
  status: ClaimStatus;
  reason: string | null;
  decision_note: string | null;
  requested_on: string;
  decided_on: string | null;
  paid_on: string | null;
  created_at: string;
  member: { full_name: string; member_number: string } | null;
  program: { name: string } | null;
  beneficiary: { full_name: string } | null;
  dependant?: { full_name: string } | null;
}

export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number;
  description: string;
  category: string | null;
  reference: string | null;
  occurred_on: string;
  member_id: string | null;
  claim_id: string | null;
  created_at: string;
  member: { full_name: string; member_number: string } | null;
  recorded_by_role?: Role;
}
