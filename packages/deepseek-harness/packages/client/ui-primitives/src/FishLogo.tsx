// Nova brand mark (collapsed sidebar / empty hero).

import type { IconProps } from './icons/props.ts'

/**
 * Render the Nova brand mark.
 * @param props.size - width in px (default 24; height is square).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M8.2 16.2V7.8h2.05c1.95 0 3.15 1.05 3.15 2.55 0 1.02-.58 1.88-1.55 2.28L14.2 16.2h-2.2l-2.05-3.35H10.2V16.2H8.2zm2-5.55h.55c.82 0 1.32-.42 1.32-1.08S11.57 8.5 10.75 8.5H10.2v2.15z"
        fill="currentColor"
      />
    </svg>
  )
}
