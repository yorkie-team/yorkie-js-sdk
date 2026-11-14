const pathProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10 3 5 8l5 5" {...pathProps} />
    </svg>
  );
}

export function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m6 3 5 5-5 5" {...pathProps} />
    </svg>
  );
}

export function Pencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.5 2.5 13.5 5.5 6 13H3v-3z" {...pathProps} />
    </svg>
  );
}
