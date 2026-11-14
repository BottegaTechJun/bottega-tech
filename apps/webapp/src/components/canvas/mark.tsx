"use client";

import type { Entity } from "@repo/shared";
import { CalendarDays, Coins } from "lucide-react";
import { useState } from "react";
import { icons } from "@/components/logo";
import { initials } from "@/lib/format";
import { roleColor } from "./style";

interface Props {
  entity: Entity;
  domain?: string | undefined;
  /** Diameter in px */
  size: number;
  className?: string;
}

/** Round entity mark: a logo clipped to a full circle when we have a grounded domain, else a glyph or monogram. */
export function Mark({ entity, domain, size, className = "" }: Props) {
  // Which icon source failed last, per domain; past the last one the monogram shows.
  const [miss, setMiss] = useState<{ domain: string; n: number } | null>(null);
  const tries = domain ? icons(domain) : [];
  const n = miss && miss.domain === domain ? miss.n : 0;
  const src = tries[n];
  const color = roleColor[entity.role];
  const box = `grid shrink-0 place-items-center overflow-hidden rounded-full ${className}`;
  const style = { width: size, height: size };

  if (domain && src) {
    // A round shows its issuer's logo with a small coin badge, so it still reads as a round.
    const round = entity.role === "round";
    return (
      <span
        className={`relative inline-block shrink-0 ${className}`}
        style={{ ...style, borderRadius: 9999 }}
      >
        <span className="block size-full overflow-hidden rounded-full border border-edge bg-text">
          {/* biome-ignore lint/performance/noImgElement: tiny remote favicon, next/image adds nothing here */}
          <img
            src={src}
            alt=""
            className="size-full rounded-full object-cover"
            onError={() => setMiss({ domain, n: n + 1 })}
            onLoad={(e) => e.currentTarget.naturalWidth <= 16 && setMiss({ domain, n: n + 1 })}
          />
        </span>
        {round && (
          <span
            className="absolute -right-0.5 -bottom-0.5 grid place-items-center rounded-full border border-ink"
            style={{
              width: Math.max(10, size * 0.42),
              height: Math.max(10, size * 0.42),
              background: color,
              color: "#09090a",
            }}
          >
            <Coins
              style={{ width: Math.max(6, size * 0.26), height: Math.max(6, size * 0.26) }}
              strokeWidth={2.25}
            />
          </span>
        )}
      </span>
    );
  }

  const tint = { ...style, background: `${color}1a`, color, borderColor: `${color}33` };
  const Glyph = entity.role === "round" ? Coins : entity.role === "event" ? CalendarDays : null;
  return (
    <span className={`${box} border font-mono font-medium`} style={tint}>
      {Glyph ? (
        <Glyph style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={1.75} />
      ) : (
        <span style={{ fontSize: Math.max(9, Math.round(size * 0.3)) }}>
          {initials(entity.name)}
        </span>
      )}
    </span>
  );
}
