import type { ReactNode } from 'react';
import { Container } from '@/components/ui';
import { requireRole } from '@/lib/auth/session';
import { AdminNav } from './AdminNav';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole('admin', '/admin');
  return (
    <div>
      <div className="border-b border-line bg-white"><Container className="pt-4"><p className="text-xs font-semibold uppercase tracking-widest text-gold-600">Administrator</p><AdminNav /></Container></div>
      <Container className="py-6">{children}</Container>
    </div>
  );
}
