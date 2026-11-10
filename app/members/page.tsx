import { MembersView } from '@/components/members/members-view';
import { RoleGate } from '@/components/auth/role-guard';

export default function MembersPage() {
  return (
    <RoleGate allow={[
      'super-administrator',
      'chairperson',
      'deputy-chairperson',
      'finance',
      'deputy-finance',
      'secretary',
      'deputy-secretary',
    ]} fallback={
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Member records are available to staff. Adding and editing members is limited to authorized governance roles.
      </div>
    }>
      <MembersView />
    </RoleGate>
  );
}
