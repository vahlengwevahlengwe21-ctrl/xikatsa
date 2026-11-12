import { RoleGate } from '@/components/auth/role-guard';
import { GalleryManager } from '@/components/gallery/gallery-manager';
import { GALLERY_MANAGEMENT_ROLES } from '@/lib/auth';

export default function GalleryPage() {
  return (
    <RoleGate allow={GALLERY_MANAGEMENT_ROLES}>
      <GalleryManager />
    </RoleGate>
  );
}
