export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className={className}>
      <rect width="512" height="512" rx="112" fill="#132C39" />
      <g transform="translate(256 256)">
        <circle r="168" fill="none" stroke="#FAF8F4" strokeWidth="12" opacity=".9" />
        <path d="M9 -9 L9 -140 A140 140 0 0 1 140 -9 Z" fill="#F4C870" />
        <path d="M9 9 L140 9 A140 140 0 0 1 9 140 Z" fill="#FAF8F4" />
        <path d="M-9 9 L-9 140 A140 140 0 0 1 -140 9 Z" fill="#FAF8F4" />
        <path d="M-140 -9 A140 140 0 0 1 -9 -140 L-9 -9 Z" fill="#FAF8F4" />
      </g>
    </svg>
  );
}

/** Mark + wordmark. `light` = for dark (navy) backgrounds. */
export function Logo({ light = false, size = 36 }: { light?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`font-display text-xl font-semibold leading-none tracking-tight ${light ? 'text-white' : 'text-navy'}`}>
        Feast<span className="text-gold-600">Quarter</span>
      </span>
    </span>
  );
}
