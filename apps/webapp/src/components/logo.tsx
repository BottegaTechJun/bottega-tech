"use client";

import { useState } from "react";
import { initials } from "@/lib/format";

interface Props {
  name: string;
  website: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}

const sizes = {
  xs: "size-5 text-[9px] rounded-md!",
  sm: "size-8 text-[11px]",
  md: "size-10 text-xs",
  lg: "size-14 text-base",
};

/** Favicon URL for a website or bare domain. */
export const favicon = (website: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(website)}&sz=128`;

/** Icon sources to try in order: Google's favicon service, then DuckDuckGo's. */
export const icons = (website: string) => [
  favicon(website),
  `https://icons.duckduckgo.com/ip3/${encodeURIComponent(website)}.ico`,
];

/** Company favicon from its website, falling back to initials. */
export function Logo({ name, website, size = "md" }: Props) {
  const [failed, setFailed] = useState(false);
  const box = `grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-hover font-mono font-medium text-dim ${sizes[size]}`;

  if (!website || failed) return <span className={box}>{initials(name)}</span>;
  return (
    <span className={box}>
      {/* biome-ignore lint/performance/noImgElement: tiny remote favicon, next/image adds nothing here */}
      <img
        src={favicon(website)}
        alt=""
        className="size-3/5 object-contain"
        onError={() => setFailed(true)}
        onLoad={(e) => e.currentTarget.naturalWidth <= 16 && setFailed(true)}
      />
    </span>
  );
}
