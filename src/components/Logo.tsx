export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#132C39" />
      <g fill="none" stroke="#F4C870" strokeLinecap="round" strokeLinejoin="round">
        <path d="M110 330a146 146 0 0 1 292 0" strokeWidth="26" />
        <path d="M86 358h340" strokeWidth="26" />
        <circle cx="256" cy="150" r="17" fill="#F4C870" stroke="none" />
      </g>
      <text x="256" y="445" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="92" fill="#FAF8F4" letterSpacing="6">BD</text>
    </svg>
  );
}

export function Logo({ light = false, size = 36 }: { light?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`font-display text-xl font-semibold leading-none ${light ? 'text-white' : 'text-navy'}`}>
        BD <span className="text-gold-600">Feast</span>
      </span>
    </span>
  );
}
