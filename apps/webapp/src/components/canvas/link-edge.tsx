"use client";

import { BaseEdge, type Edge, EdgeLabelRenderer, type EdgeProps, useStore } from "@xyflow/react";
import { memo, useState } from "react";

export type LinkEdgeData = {
  color: string;
  /** Reasoned connection (bold) vs. a raw Cala relation seen while exploring */
  reasoned: boolean;
  label: string | null;
  /** Shows the label while active; only one segment of a connection does */
  first: boolean;
  active: boolean;
  faded: boolean;
  /** Radii of the end nodes, so the line and its arrow stop at the node edge */
  gap: [number, number];
  /** Absolute y a long link bends through to stay clear of middle levels */
  detour?: number | null;
};
export type LinkEdge = Edge<LinkEdgeData, "link">;

/** Moves (x, y) toward (px, py) by d. */
function toward(x: number, y: number, px: number, py: number, d: number): [number, number] {
  const len = Math.hypot(px - x, py - y) || 1;
  const step = Math.min(d, len * 0.45);
  return [x + ((px - x) / len) * step, y + ((py - y) / len) * step];
}

/** Link between node rims with an arrowhead; the label pill only shows on hover. */
function LinkEdgeView(props: EdgeProps<LinkEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, data, markerEnd } = props;
  const [hover, setHover] = useState(false);
  const zoom = useStore((s) => s.transform[2]);
  const [gapA, gapB] = data?.gap ?? [0, 0];
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  let path: string;
  let midX: number;
  let midY: number;
  if (Math.abs(dx) > Math.max(gapA + gapB, 24)) {
    // Between levels: leave the right rim, enter the left rim, flat at both ends.
    const dir = Math.sign(dx);
    const sx = sourceX + dir * (gapA + 2);
    const tx = targetX - dir * (gapB + 6);
    const bend = data?.detour;
    if (typeof bend === "number") {
      const mx = (sx + tx) / 2;
      const k = Math.abs(tx - sx) * 0.22;
      path = `M ${sx} ${sourceY} C ${sx + dir * k} ${sourceY}, ${mx - dir * k} ${bend}, ${mx} ${bend} S ${tx - dir * k} ${targetY}, ${tx} ${targetY}`;
      midX = mx;
      midY = bend;
    } else {
      const k = Math.abs(tx - sx) * 0.5;
      path = `M ${sx} ${sourceY} C ${sx + dir * k} ${sourceY}, ${tx - dir * k} ${targetY}, ${tx} ${targetY}`;
      midX = (sx + tx) / 2;
      midY = (sourceY + targetY) / 2;
    }
  } else {
    // Within one level: a gentle bend so stacked links don't overlap.
    const bend = 0.12;
    const cx = (sourceX + targetX) / 2 - dy * bend;
    const cy = (sourceY + targetY) / 2 + dx * bend;
    const [sx, sy] = toward(sourceX, sourceY, cx, cy, gapA + 3);
    const [tx, ty] = toward(targetX, targetY, cx, cy, gapB + 5);
    path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
    midX = 0.25 * sx + 0.5 * cx + 0.25 * tx;
    midY = 0.25 * sy + 0.5 * cy + 0.25 * ty;
  }

  const color = data?.color ?? "#9a9aa2";
  const reasoned = data?.reasoned ?? false;
  const active = data?.active ?? false;
  const lit = active || hover;
  const opacity = data?.faded ? 0.08 : reasoned ? (lit ? 1 : 0.55) : hover ? 0.5 : 0.18;
  const show = Boolean(data?.label) && !data?.faded && hover;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only reveals the label; React Flow handles clicks
    <g onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={20}
        style={{
          stroke: reasoned ? color : "#ffffff",
          strokeWidth: reasoned ? (lit ? 2 : 1.25) : 0.75,
          strokeDasharray: reasoned ? undefined : "2 4",
          opacity,
          transition: "opacity 0.3s, stroke-width 0.2s",
        }}
      />
      {show && (
        <EdgeLabelRenderer>
          <span
            className="pointer-events-none absolute rounded-full border border-edge bg-panel px-2 py-0.5 text-[11px] whitespace-nowrap text-text shadow-[0_6px_18px_rgb(0_0_0/0.4)]"
            style={{
              transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px) scale(${1 / zoom})`,
            }}
          >
            {data?.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

export const LinkEdgeComponent = memo(LinkEdgeView);
