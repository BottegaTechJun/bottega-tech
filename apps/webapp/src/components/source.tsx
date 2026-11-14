import type { Cite, Rank } from "@repo/shared";
import { day } from "@/lib/format";

const tone: Record<Rank, string> = {
  FILING: "border-accent/50 text-accent",
  PRIMARY: "border-edge text-text",
  PRESS: "border-line text-dim",
  AGGREGATOR: "border-dashed border-line text-faint",
  OTHER: "border-dashed border-line text-faint",
};

/** Badge for the strongest source of a fact; links to the document, lists the rest on hover. */
export function Source({ cites }: { cites: Cite[] }) {
  const [top] = cites;
  if (!top) {
    return (
      <span className="rounded-full border border-dashed border-line px-2 py-0.5 font-mono text-[10px] text-faint">
        NO SOURCE
      </span>
    );
  }
  const title = cites.map((c) => `${c.rank} · ${c.name} · ${day(c.date)}`).join("\n");
  const body = (
    <>
      {top.rank === "OTHER" ? "SOURCE" : top.rank}
      {cites.length > 1 && <span className="text-faint">+{cites.length - 1}</span>}
    </>
  );
  const style = `inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide transition ${tone[top.rank]}`;

  return top.url ? (
    <a
      href={top.url}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={`${style} hover:bg-hover`}
    >
      {body}
    </a>
  ) : (
    <span title={title} className={style}>
      {body}
    </span>
  );
}
