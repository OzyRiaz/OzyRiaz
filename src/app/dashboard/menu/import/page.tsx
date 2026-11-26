import type { Metadata } from 'next';
import Link from 'next/link';
import { MenuImporter } from '@/components/MenuImporter';
import { isDemo } from '@/lib/config';
import { requireSession } from '@/lib/auth/session';
import { aiAvailable } from '@/lib/menu-import/ai';
import { SAMPLE_MENU } from '@/lib/menu-import/sample';
import { listCategoryNames } from '@/lib/services/menu-import';
export const metadata: Metadata = { title: 'Import a menu — Dashboard' };
export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const s = await requireSession('/dashboard');
  const rid = s.restaurantIds[0];
  const cats = rid ? await listCategoryNames(rid) : [];
  return (
    <div className="space-y-5">
      <div><Link href="/dashboard/menu" className="text-sm font-semibold text-navy underline">← Back to menu</Link><h2 className="mt-2 font-display text-2xl font-semibold text-navy">Import a menu</h2>
        <p className="mt-1 text-sm text-muted">Paste your menu{aiAvailable() || isDemo ? ' or upload a photo or PDF' : ''} and we will turn it into a draft. You check and fix everything before anything is saved.</p></div>
      <MenuImporter aiOn={aiAvailable() || isDemo} sample={SAMPLE_MENU} existingCategories={cats} />
    </div>
  );
}
