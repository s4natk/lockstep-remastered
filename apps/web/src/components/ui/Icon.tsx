import type { ReactNode } from "react";

const PATHS = {
  review: (
    <>
      <path d="M4 1.75h5.25L12.25 4.75v9.5H4z" />
      <path d="M9 1.75v3.25h3.25" />
      <path d="M6.25 8.25h3.5M6.25 10.75h2.25" />
    </>
  ),
  ask: <path d="M2.75 3.25h10.5v7.5H8.25L5.25 13.25v-2.5h-2.5z" />,
  context: (
    <>
      <path d="M8 2.25 13.75 5.25 8 8.25 2.25 5.25z" />
      <path d="M2.25 8.25 8 11.25l5.75-3" />
      <path d="M2.25 11 8 14l5.75-3" />
    </>
  ),
  library: (
    <>
      <path d="M2.75 2.75h3v10.5h-3zM5.75 2.75h3v10.5h-3z" />
      <path d="m9.6 3.6 2.75-.75 2.15 9.75-2.75.75z" />
    </>
  ),
  settings: (
    <>
      <path d="M2.5 4.75h6.25M12.25 4.75h1.25M2.5 11.25h1.25M7.25 11.25h6.25" />
      <circle cx="10.5" cy="4.75" r="1.75" />
      <circle cx="5.5" cy="11.25" r="1.75" />
    </>
  ),
  plus: <path d="M8 3.25v9.5M3.25 8h9.5" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.25 3.25" />
    </>
  ),
  play: <path d="M5 3.25v9.5l7.75-4.75z" />,
  stop: <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.25" />,
  copy: (
    <>
      <rect x="5.75" y="5.75" width="7.5" height="7.5" rx="1.25" />
      <path d="M3.25 10.25V4a1.25 1.25 0 0 1 1.25-1.25h5.75" />
    </>
  ),
  check: <path d="m3.5 8.5 3 3 6-7" />,
  download: <path d="M8 2.5v8M4.75 7.25 8 10.5l3.25-3.25M3 13.25h10" />,
  link: (
    <>
      <path d="m7 4.5 1-1a2.83 2.83 0 0 1 4 4l-1 1" />
      <path d="m9 11.5-1 1a2.83 2.83 0 0 1-4-4l1-1" />
      <path d="m6.25 9.75 3.5-3.5" />
    </>
  ),
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.75h5.8l.6-8.75" />,
  x: <path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />,
  chevronRight: <path d="M6.25 3.75 10.5 8l-4.25 4.25" />,
  chevronDown: <path d="M3.75 6.25 8 10.5l4.25-4.25" />,
  chevronLeft: <path d="M9.75 3.75 5.5 8l4.25 4.25" />,
  sidebar: (
    <>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.75" />
      <path d="M6.25 2.75v10.5" />
    </>
  ),
  inspector: (
    <>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.75" />
      <path d="M9.75 2.75v10.5" />
    </>
  ),
  format: <path d="M2.75 3.75h10.5M5.25 6.5h8M5.25 9.25h8M2.75 12h10.5" />,
  clear: (
    <>
      <path d="M6 3.5h7.25v9H6L2.5 8z" />
      <path d="m8.25 6.25 2.75 3.5M11 6.25l-2.75 3.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.25M8 13v1.25M1.75 8H3M13 8h1.25M3.6 3.6l.9.9M11.5 11.5l.9.9M3.6 12.4l.9-.9M11.5 4.5l.9-.9" />
    </>
  ),
  moon: <path d="M13.25 9.75A5.5 5.5 0 1 1 6.25 2.75a4.5 4.5 0 0 0 7 7z" />,
  monitor: (
    <>
      <rect x="2" y="2.75" width="12" height="8.5" rx="1.5" />
      <path d="M6 13.75h4M8 11.25v2.5" />
    </>
  ),
  more: (
    <>
      <circle cx="3.5" cy="8" r="0.6" />
      <circle cx="8" cy="8" r="0.6" />
      <circle cx="12.5" cy="8" r="0.6" />
    </>
  ),
  dataLoss: (
    <>
      <path d="M2.75 3.75h10.5M2.75 12.25h10.5M2.75 8h4" />
      <path d="m9.5 6.25 3 3.5M12.5 6.25l-3 3.5" />
    </>
  ),
  lock: (
    <>
      <rect x="3.75" y="7.25" width="8.5" height="6" rx="1.25" />
      <path d="M5.5 7.25V5.5a2.5 2.5 0 0 1 5 0v1.75" />
    </>
  ),
  rewrite: (
    <>
      <path d="M12.75 8A4.75 4.75 0 0 1 4.5 11.25M3.25 8A4.75 4.75 0 0 1 11.5 4.75" />
      <path d="M11.75 2.5v2.5h-2.5M4.25 13.5V11h2.5" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.5 14 13H2z" />
      <path d="M8 6.5v3M8 11.25v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 7.25v3.75M8 5v.01" />
    </>
  ),
  arrowUp: <path d="M8 13V3.5M4.25 7.25 8 3.5l3.75 3.75" />,
  arrowDown: <path d="M8 3v9.5M4.25 8.75 8 12.5l3.75-3.75" />,
  external: <path d="M9.5 2.75h3.75V6.5M13 3 7.75 8.25M11.5 9.5v3.75H2.75V4.5H6.5" />,
  keyboard: (
    <>
      <rect x="1.75" y="4" width="12.5" height="8" rx="1.5" />
      <path d="M4.25 6.5h.01M6.75 6.5h.01M9.25 6.5h.01M11.75 6.5h.01M4.25 9.5h7.5" />
    </>
  ),
  menu: <path d="M2.75 4.5h10.5M2.75 8h10.5M2.75 11.5h10.5" />,
  wrap: <path d="M2.75 4h10.5M2.75 8h8.5a2 2 0 0 1 0 4H8.5M9.75 10.5 8.25 12l1.5 1.5M2.75 12h3" />,
  history: (
    <>
      <path d="M2.75 8A5.25 5.25 0 1 0 4.3 4.3" />
      <path d="M2.5 2.5v2.75h2.75M8 5.25V8l2 1.25" />
    </>
  ),
  edit: <path d="M10.5 2.75 13.25 5.5 6 12.75H3.25V10z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  label?: string;
}

export function Icon({ name, size = 16, className, label }: IconProps) {
  const filled = name === "more" || name === "play";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={name === "more" ? 1.2 : 1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
