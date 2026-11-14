"use client";

import { BaseEdge, type Edge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { memo } from "react";

export type LinkEdgeData = {
  color: string;
  /** Reasoned connection (bold, labelled) vs. a raw Cala relation seen while exploring */
  reasoned: boolean;
  label: string | null;
  active: boolean;
  faded: boolean;
  /** Opens this link's details; labels need it because they sit above the line */
  open?: () => void;
};
export type LinkEdge = Edge<LinkEdgeData, "link">;

/** Center-to-center curve with a gentle bend, so parallel links don't overlap. */
function LinkEdgeView({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<LinkEdge>) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const bend = 0.12;
  const cx = (sourceX + targetX) / 2 - dy * bend;
  const cy = (sourceY + targetY) / 2 + dx * bend;
  const path = `M ${sourceX} ${sourceY} Q ${cx} ${cy} ${targetX} ${targetY}`;
  const midX = 0.25 * sourceX + 0.5 * cx + 0.25 * targetX;
  const midY = 0.25 * sourceY + 0.5 * cy + 0.25 * targetY;

  const color = data?.color ?? "#9a9aa2";
  const reasoned = data?.reasoned ?? false;
  const active = data?.active ?? false;
  const opacity = data?.faded ? 0.08 : reasoned ? (active ? 1 : 0.6) : 0.18;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={24}
        style={{
          stroke: reasoned ? color : "#ffffff",
          strokeWidth: reasoned ? (active ? 2 : 1.25) : 0.75,
          strokeDasharray: reasoned ? undefined : "2 4",
          opacity,
          transition: "opacity 0.4s, stroke-width 0.2s",
        }}
      />
      {reasoned && data?.label && !data.faded && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={data.open}
            className={`nodrag nopan pointer-events-auto absolute cursor-pointer rounded-md bg-panel px-1.5 py-0.5 text-[11px] whitespace-nowrap transition hover:bg-raise hover:text-text ${active ? "text-text" : "text-dim"}`}
            style={{ transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)` }}
          >
            {data.label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const LinkEdgeComponent = memo(LinkEdgeView);
