import { RoleGate } from '@/components/auth/role-guard';
import { GalleryManager } from '@/components/gallery/gallery-manager';

export default function GalleryPage() {
  return (
    <RoleGate allow={['secretary', 'deputy-secretary']}>
      <GalleryManager />
    </RoleGate>
  );
}
