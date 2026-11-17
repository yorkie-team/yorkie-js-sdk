import type { SVGProps } from 'react';

// Icons drawn in one 1.5px stroke on a 16px grid, colored by `currentColor`.
const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export function CloseIcon() {
  return (
    <svg {...base}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function ReactIcon() {
  return (
    <svg {...base}>
      <path d="M13.9 7.2A6 6 0 1 1 8.8 2.1" />
      <path d="M5.5 9.5c.6.9 1.5 1.4 2.5 1.4s1.9-.5 2.5-1.4" />
      <path d="M6 6.2v.1M10 6.2v.1" />
      <path d="M12.5 1.5v4M10.5 3.5h4" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 6.5L8 10l3.5-3.5" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 8h9M8 4.5L11.5 8 8 11.5" />
    </svg>
  );
}
