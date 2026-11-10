// Nova product wordmark (replaces DeepSeek Harness SVG letterforms).

import type { IconProps } from './icons/props.ts'

/**
 * Render the Nova brand wordmark.
 * @param props.size - height in px (default 24; width keeps a compact ratio).
 * @param props.className - extra class for layout placement.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  const width = (size * 72) / 24
  return (
    <svg
      width={width}
      height={size}
      className={className}
      viewBox="0 0 72 24"
      fill="none"
      aria-hidden="true"
    >
      <text
        x="0"
        y="17.5"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
        fontSize="16"
        fontWeight="650"
        letterSpacing="0.02em"
      >
        Nova
      </text>
    </svg>
  )
}
