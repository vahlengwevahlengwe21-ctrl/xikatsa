import { MemberDetailView } from '@/components/members/member-detail-view';
import { RoleGate } from '@/components/auth/role-guard';

export default function MemberDetailPage({ params }: { params: { id: string } }) {
  return (
    <RoleGate allow={[
      'super-administrator',
      'chairperson',
      'deputy-chairperson',
      'finance',
      'deputy-finance',
      'secretary',
      'deputy-secretary',
    ]}>
      <MemberDetailView memberId={params.id} />
    </RoleGate>
  );
}
