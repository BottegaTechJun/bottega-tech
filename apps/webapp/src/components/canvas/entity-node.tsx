"use client";

import type { Entity } from "@repo/shared";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { initials } from "@/lib/format";
import { roleColor, roleLabel } from "./style";

export type EntityNodeData = {
  entity: Entity;
  /** Suggested investor rank, 1-based */
  rank: number | null;
  center: boolean;
  /** Issuer name for a funding round */
  of: string | null;
  /** Seen while exploring but not part of the final answer */
  faded: boolean;
};
export type EntityNode = Node<EntityNodeData, "entity">;

const hidden =
  "!pointer-events-none !left-1/2 !top-1/2 !size-px !min-h-0 !min-w-0 !border-0 !opacity-0";

function EntityNodeView({ data, selected }: NodeProps<EntityNode>) {
  const { entity, rank, center, faded, of } = data;
  const color = roleColor[entity.role];
  const sub = rank ? `Suggested lead #${rank}` : center ? "Your company" : roleLabel[entity.role];

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border bg-panel pr-3.5 pl-2 transition-[opacity,border-color] duration-300 ${
        selected ? "border-edge bg-raise" : "border-line hover:border-edge"
      } ${center ? "py-2.5" : "py-2"}`}
      style={{ opacity: faded ? 0.3 : 1 }}
    >
      <Handle type="target" position={Position.Top} className={hidden} />
      <Handle type="source" position={Position.Top} className={hidden} />

      <span
        className={`grid shrink-0 place-items-center rounded-lg font-mono font-medium ${center ? "size-8 text-[11px]" : "size-6 text-[10px]"}`}
        style={{ background: `${color}1f`, color }}
      >
        {initials(entity.name)}
      </span>
      <span className="min-w-0 max-w-52">
        <span
          className={`block truncate leading-tight ${center ? "text-[15px] font-semibold" : "text-[13px]"}`}
        >
          {of && <span className="text-dim">{of} </span>}
          {entity.name}
        </span>
        <span className={`block text-[11px] ${rank ? "text-text/80" : "text-faint"}`}>{sub}</span>
      </span>
    </div>
  );
}

export const EntityNodeComponent = memo(EntityNodeView);
