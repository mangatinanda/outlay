import type { ComponentProps } from "react";

/**
 * Outlay brand mark — the "rich" variant (Mosaic O with rupee + parapet tiles).
 * Used at large sizes: login card header, first-household onboarding splash,
 * any place where there's room for the four saffron accent tiles to read.
 *
 * For favicon / PWA tile / small UI, the small-bleed icon at /icons/icon.svg
 * is used directly via the Next.js metadata.icons config — not this component.
 *
 * Drawn inline (no <img>) so it inherits color/size from props/CSS and can
 * sit alongside other Lucide icons without an extra HTTP request.
 */
export function AppLogo({
  size = 64,
  ...props
}: { size?: number } & Omit<ComponentProps<"svg">, "viewBox">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="Outlay"
      {...props}
    >
      <rect width="512" height="512" rx="108" fill="#f7eecf" />
      <circle
        cx="256"
        cy="256"
        r="160"
        fill="none"
        stroke="#d97da2"
        strokeWidth="64"
      />
      <g fill="#f4c542">
        <rect x="240" y="60" width="32" height="32" rx="3" />
        <rect x="240" y="420" width="32" height="32" rx="3" />
        <rect x="60" y="240" width="32" height="32" rx="3" />
        <rect x="420" y="240" width="32" height="32" rx="3" />
      </g>
      <g
        transform="translate(136 136) scale(10)"
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3h12" />
        <path d="M6 8h12" />
        <path d="m6 13 8.5 8" />
        <path d="M6 13h3" />
        <path d="M9 13c6.667 0 6.667-10 0-10" />
      </g>
    </svg>
  );
}
