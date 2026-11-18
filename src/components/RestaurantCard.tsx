import { Clock, Bike, ShoppingBag, Crown } from 'lucide-react';
import Link from 'next/link';
import { fmt } from '@/lib/money';
import type { RestaurantCard as R } from '@/lib/services/restaurants';
import { Photo } from './FoodArt';
import { Badge } from './ui';

export function RestaurantCard({ r, postcode }: { r: R; postcode?: string | null }) {
  const href = `/restaurants/${r.slug}${postcode ? `?postcode=${encodeURIComponent(postcode)}` : ''}`;
  return (
    <Link href={href} className="group animate-rise block overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div className="relative">
        <Photo src={r.image_url} cuisine={r.cuisines[0]} alt="" className="h-36 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {r.is_demo && <Badge tone="demo">Demo</Badge>}
          {r.has_member_offer && <Badge tone="gold"><Crown size={12} />Member offer</Badge>}
        </div>
        {!r.open_now && <div className="absolute inset-0 flex items-end bg-navy/40"><span className="m-3 rounded-lg bg-white/95 px-2 py-1 text-xs font-semibold text-navy">Closed now</span></div>}
      </div>
      <div className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold leading-tight text-navy">{r.name}</h3>
        </div>
        <p className="text-sm text-muted">{r.cuisines.join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock size={13} />{r.prep_minutes}–{r.prep_minutes + 15} min</span>
          {r.availability === 'delivers' && <span className="inline-flex items-center gap-1 font-medium text-ok"><Bike size={13} />Delivery {r.delivery_fee_pence ? fmt(r.delivery_fee_pence) : 'free'}</span>}
          {r.availability === 'collection_only' && <span className="inline-flex items-center gap-1 font-medium text-navy"><ShoppingBag size={13} />Collection only for your postcode</span>}
          {r.availability === 'unknown' && <>{r.delivery_enabled && <span className="inline-flex items-center gap-1"><Bike size={13} />Delivery</span>}{r.collection_enabled && <span className="inline-flex items-center gap-1"><ShoppingBag size={13} />Collection</span>}</>}
          {r.min_order_pence > 0 && <span>Min {fmt(r.min_order_pence)}</span>}
        </div>
      </div>
    </Link>
  );
}
