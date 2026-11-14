"use client";

import type { Entity } from "@repo/shared";
import { Handle, type Node, type NodeProps, NodeToolbar, Position } from "@xyflow/react";
import { memo, useState } from "react";
import { Mark } from "./mark";
import { roleLabel } from "./style";

export type EntityNodeData = {
  entity: Entity;
  /** Suggested investor rank, 1-based */
  rank: number | null;
  center: boolean;
  /** Issuer name for a funding round */
  of: string | null;
  /** Seen while exploring but not part of the final answer */
  faded: boolean;
  /** Stepped back in the idle answer graph */
  muted?: boolean;
  domain: string | undefined;
  /** Diameter in px; edges trim to it */
  size: number;
  /** Caption under the logo, used in the expanded view */
  labels: boolean;
};
export type EntityNode = Node<EntityNodeData, "entity">;

const hidden =
  "!pointer-events-none !left-1/2 !top-1/2 !size-px !min-h-0 !min-w-0 !border-0 !opacity-0";

/** Logo-only node; name and type live in a hover tooltip so the canvas stays quiet. */
function EntityNodeView({ data, selected }: NodeProps<EntityNode>) {
  const { entity, rank, center, faded, muted, of, domain, size, labels } = data;
  const [hover, setHover] = useState(false);
  const sub = rank
    ? `End: suggested investor #${rank}`
    : center
      ? "Start: your company"
      : roleLabel[entity.role];
  const ring = selected
    ? "ring-2 ring-text ring-offset-2 ring-offset-ink"
    : center
      ? "ring-2 ring-accent/70 ring-offset-2 ring-offset-ink"
      : rank
        ? "ring-1 ring-accent/50 ring-offset-2 ring-offset-ink"
        : "";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only reveals the tooltip; React Flow handles clicks
    <div
      className="relative cursor-pointer transition-opacity duration-300"
      style={{ opacity: faded ? 0.3 : muted ? 0.55 : 1 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Handle type="target" position={Position.Top} className={hidden} />
      <Handle type="source" position={Position.Top} className={hidden} />

      <NodeToolbar isVisible={hover && !labels} position={Position.Top} offset={10}>
        <div className="pointer-events-none max-w-64 rounded-lg border border-edge bg-panel px-2.5 py-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.45)]">
          <p className="truncate text-[13px] font-medium text-text">
            {of && <span className="text-dim">{of} </span>}
            {entity.name}
          </p>
          <p className="text-[11px] text-faint">{sub}</p>
        </div>
      </NodeToolbar>

      <Mark
        entity={entity}
        domain={domain}
        size={size}
        className={`transition-shadow ${ring} ${hover ? "brightness-110" : ""}`}
      />
      {labels && (
        <span className="pointer-events-none absolute top-full left-1/2 mt-1.5 flex w-max max-w-40 -translate-x-1/2 flex-col items-center rounded-md bg-panel/90 px-1.5 py-0.5 text-center">
          <span className="max-w-full truncate text-[12px] leading-tight font-medium text-text">
            {of && <span className="text-dim">{of} </span>}
            {entity.name}
          </span>
          <span
            className={`text-[10px] leading-tight ${rank || center ? "text-accent/80" : "text-faint"}`}
          >
            {sub}
          </span>
        </span>
      )}
      {rank && (
        <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-accent font-mono text-[9px] font-semibold text-accent-ink">
          {rank}
        </span>
      )}
    </div>
  );
}

export const EntityNodeComponent = memo(EntityNodeView);
