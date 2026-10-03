import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Admin from '@/pages-ui/admin';
import { staffSections } from '@/lib/staff-route';

export const metadata: Metadata = { title: 'Staff console', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const name = section?.[0] || 'overview';
  if ((section?.length || 0) > 1 || !staffSections.some(s => s === name)) notFound();
  return <Admin section={name[0].toUpperCase() + name.slice(1)} />;
}
