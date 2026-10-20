import React from "react";

const PATHS = {
  home: "M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5h-6v5H5.5A1.5 1.5 0 0 1 4 19z",
  play: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-2 5.5 6 3.5-6 3.5z",
  clapper: "M4 9h16v9.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5zM4 8l15-3.8.5 2L5 10zM10.5 12.5v5l4-2.5z",
  book: "M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13",
  chart: "M5 19V11M10 19V6M15 19v-6M20 19V9",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4",
  arrow: "M5 12h13m-5-5 5 5-5 5",
  close: "M6 6l12 12M18 6 6 18",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  calendar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4",
  plus: "M12 5v14M5 12h14",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M18 14a6 6 0 0 1 4 6v1",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4",
} as const;

export type IconName = keyof typeof PATHS;

const FILLED: IconName[] = ["home", "play", "clapper"];

export const Icon: React.FC<{ name: IconName; size?: number; className?: string }> = ({
  name,
  size = 22,
  className,
}) => {
  const filled = FILLED.indexOf(name) >= 0;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {name === "play" || name === "clapper" ? (
        <path d={PATHS[name]} fillRule="evenodd" />
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  );
};
