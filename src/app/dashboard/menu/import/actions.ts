'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { commitMenuImport, MenuImportError } from '@/lib/services/menu-import';

/** Saves the owner-reviewed items. The restaurant comes from the SESSION, never from the browser. */
export async function commitImportAction(payload: unknown): Promise<{ error?: string; created?: number; skipped?: number }> {
  const s = await requireSession('/dashboard');
  const rid = s.restaurantIds[0];
  if (!rid || s.role !== 'restaurant') redirect('/dashboard');
  try {
    const r = await commitMenuImport(rid, payload);
    revalidatePath('/dashboard/menu');
    return { created: r.created, skipped: r.skipped };
  } catch (e) {
    if (e instanceof MenuImportError) return { error: e.message };
    return { error: 'Could not save the menu. Please try again.' };
  }
}
