import { RoleGate } from '@/components/auth/role-guard';
import { SocietySettingsPanel } from '@/components/settings/society-settings-panel';
import { UsersRolesPanel } from '@/components/settings/users-roles-panel';
import { CommitteeRosterPanel } from '@/components/settings/committee-roster-panel';
import { CommitteeProfilesPanel } from '@/components/settings/committee-profiles-panel';

export default function SettingsPage() {
  return (
    <RoleGate allow={['super-administrator', 'chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary']}>
      <div className="space-y-6">
        <SocietySettingsPanel />
        <CommitteeRosterPanel />
        <CommitteeProfilesPanel />
        <UsersRolesPanel />
      </div>
    </RoleGate>
  );
}
