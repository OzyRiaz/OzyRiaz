'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { reorderAction } from '@/app/actions/customer';
import { useBasket } from './BasketProvider';
import { btn } from './ui';

export function ReorderButton({ orderId }: { orderId: string }) {
  const { add } = useBasket();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <div className="no-print">
      <button disabled={pending} onClick={() => start(async () => {
        const r = await reorderAction(orderId);
        if (!r.ok) { setMsg(r.error); return; }
        r.lines.forEach((l, i) => add(r.restaurant, { itemId: l.itemId, name: l.name, qty: l.qty, optionChoiceIds: l.optionChoiceIds, optionLabels: l.optionLabels, unitPence: l.unitPence, note: l.note }, i === 0));
        if (r.skipped.length) { setMsg(`Added to your basket. Not available today: ${r.skipped.join(', ')}.`); setTimeout(() => router.push('/basket'), 1800); } else router.push('/basket');
      })} className={btn('gold', 'md')}>{pending ? 'Adding…' : 'Order again'}</button>
      {msg && <p role="status" className="mt-2 text-sm text-muted">{msg}</p>}
    </div>
  );
}
