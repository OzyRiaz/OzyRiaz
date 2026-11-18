import clsx from 'clsx';

const ART: Record<string, { e: string; a: string; b: string }> = {
  indian: { e: '🍛', a: '#f4a340', b: '#b8421f' }, pakistani: { e: '🍛', a: '#f4a340', b: '#b8421f' },
  burgers: { e: '🍔', a: '#f6c453', b: '#c4571b' }, chicken: { e: '🍗', a: '#f2b24c', b: '#a8421a' },
  pizza: { e: '🍕', a: '#f08a4b', b: '#a22c29' }, italian: { e: '🍝', a: '#e9695a', b: '#7e1f2b' },
  chinese: { e: '🥡', a: '#e5483f', b: '#7a1a1a' }, asian: { e: '🥢', a: '#e5483f', b: '#7a1a1a' },
  'fish & chips': { e: '🐟', a: '#5ca4c8', b: '#1b4965' }, british: { e: '🍟', a: '#5ca4c8', b: '#1b4965' },
  'middle eastern': { e: '🥙', a: '#c2a15a', b: '#6b4a1a' }, turkish: { e: '🥙', a: '#c2a15a', b: '#6b4a1a' },
  desserts: { e: '🧇', a: '#e58fb0', b: '#8b2d58' }, bakery: { e: '🍪', a: '#d9a066', b: '#7a4a1e' },
  healthy: { e: '🥗', a: '#7fbf7b', b: '#1f6a3d' }, vegan: { e: '🥗', a: '#7fbf7b', b: '#1f6a3d' },
};
const def = { e: '🍽️', a: '#27506a', b: '#132c39' };
export const artFor = (cuisine?: string) => ART[(cuisine ?? '').toLowerCase()] ?? def;

/** Original illustrated placeholder shown until a restaurant uploads its own photography. */
export function FoodArt({ cuisine, className, size = 'md' }: { cuisine?: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const { e, a, b } = artFor(cuisine);
  return (
    <div role="img" aria-label={`${cuisine ?? 'Food'} illustration`} className={clsx('relative flex items-center justify-center overflow-hidden', className)} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      <div aria-hidden className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -bottom-10 -left-6 h-36 w-36 rounded-full bg-black/10" />
      <span aria-hidden className={clsx('relative drop-shadow-lg', size === 'lg' ? 'text-7xl' : size === 'sm' ? 'text-3xl' : 'text-5xl')}>{e}</span>
    </div>
  );
}

export function Photo({ src, cuisine, alt, className, size }: { src?: string | null; cuisine?: string; alt: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt={alt} loading="lazy" className={clsx('object-cover', className)} />;
  return <FoodArt cuisine={cuisine} className={className} size={size} />;
}
