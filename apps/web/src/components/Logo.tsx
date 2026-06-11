// Brand logo — a transparent inline SVG (globe + envelope + paper plane + wifi +
// chat + sparkles) plus the "Inboxi" wordmark (navy "Inbox" + green leaf "i").
// Vector + transparent by design, so it stays crisp on any background.

export function LogoIcon({ className = '', size = 36 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="ix-globe" x1="14" y1="50" x2="52" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1d4ed8" />
          <stop offset="0.55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
        <linearGradient id="ix-env" x1="20" y1="52" x2="46" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e40af" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="ix-plane" x1="34" y1="44" x2="52" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfe3ff" />
        </linearGradient>
        <radialGradient id="ix-shine" cx="0.35" cy="0.3" r="0.7">
          <stop stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* globe */}
      <circle cx="32" cy="33" r="21" fill="url(#ix-globe)" />
      <circle cx="32" cy="33" r="21" fill="url(#ix-shine)" />
      {/* orbit swoosh */}
      <path
        d="M14 38c6 6 22 8 33 1"
        stroke="#bfdbfe"
        strokeOpacity="0.85"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* envelope */}
      <g>
        <rect x="20" y="33" width="26" height="17" rx="2.5" fill="url(#ix-env)" />
        <path d="M20.5 34.5 33 43l12.5-8.5" fill="none" stroke="#dbeafe" strokeWidth="2" strokeLinejoin="round" />
      </g>

      {/* paper plane */}
      <g>
        <path d="M33 41 53 24 38 45l-1.5-3.5Z" fill="url(#ix-plane)" />
        <path d="M53 24 41 43l-3-4Z" fill="#9cc4ff" fillOpacity="0.9" />
      </g>

      {/* wifi arcs */}
      <g stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M13 22a10 10 0 0 1 9-5" />
        <path d="M14.5 26a6.5 6.5 0 0 1 6-3.2" />
        <path d="M16 30a3 3 0 0 1 3-1.6" />
      </g>

      {/* chat bubble */}
      <g>
        <rect x="20" y="22" width="13" height="9" rx="3" fill="#ffffff" />
        <path d="M24 31l-2 3v-3Z" fill="#ffffff" />
        <circle cx="23.5" cy="26.5" r="1.1" fill="#3b82f6" />
        <circle cx="26.5" cy="26.5" r="1.1" fill="#3b82f6" />
        <circle cx="29.5" cy="26.5" r="1.1" fill="#3b82f6" />
      </g>

      {/* sparkles */}
      <path d="M50 16l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1Z" fill="#4ade80" />
      <path d="M54 24l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7Z" fill="#38bdf8" />
    </svg>
  );
}

export function Logo({
  className = '',
  tagline = false,
  size = 36,
}: {
  className?: string;
  tagline?: boolean;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="group/logo relative inline-flex">
        <LogoIcon size={size} className="transition-transform duration-300 group-hover/logo:-translate-y-0.5 group-hover/logo:rotate-[-3deg]" />
      </span>
      <span className="leading-none">
        <span className="block text-[1.35em] font-extrabold tracking-tight">
          <span className="text-[#0f2557]">Inbox</span>
          <span className="bg-gradient-to-br from-green-500 to-lime-500 bg-clip-text text-transparent">i</span>
        </span>
        {tagline && (
          <span className="mt-0.5 block text-[0.62em] font-medium tracking-wide text-gray-400">
            Send &amp; receive emails anonymously
          </span>
        )}
      </span>
    </span>
  );
}
