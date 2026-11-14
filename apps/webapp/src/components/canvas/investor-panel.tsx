"use client";

import type { Cite, Entity, Prefs } from "@repo/shared";
import { Check, ChevronDown, Minus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { day } from "@/lib/format";
import type { Run } from "@/lib/matchup";
import { answer } from "@/lib/prefs";
import { Actions, actions } from "./actions";
import type { Selection } from "./board";
import { brief } from "./investors";
import { Mark } from "./mark";
import { RouteList } from "./routes";
import { Scope } from "./scope";

interface Props {
  run: Run;
  id: string;
  company: { id: string; name: string };
  prefs: Prefs;
  domains: Record<string, string>;
  select: (selection: Selection) => void;
  /** Route state, shared with the main graph */
  active: number | null;
  picked: number | null;
  hover: (index: number | null) => void;
  pick: (index: number | null) => void;
}

/** Side panel for a suggested investor: why, the paths to us, and fit with our next round. */
export function InvestorPanel(props: Props) {
  const { run, id, company, prefs, domains, select, active, picked, hover, pick } = props;
  const row = brief(run, id, company.id);
  if (!row) return null;
  const text = [row.why, ...row.paths.flatMap((c) => [c.label, c.reasoning, ...c.factors])].join(
    " ",
  );

  return (
    <div className="animate-rise">
      <div className="flex items-center gap-3">
        <Mark entity={row.entity} domain={domains[row.entity.id]} size={44} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight">{row.entity.name}</h2>
          <p className="text-[13px] text-dim">
            {row.type}, suggestion #{row.rank}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-text/90">{row.why}</p>
      <Sources cites={row.evidence} />

      {row.routes.length > 0 && (
        <Section title="Next steps">
          <Actions
            list={actions(row.routes, run, company.id, id)}
            domains={domains}
            pick={pick}
            picked={picked}
          />
        </Section>
      )}

      <Section
        title="How it connects"
        count={`${row.routes.length} ${row.routes.length === 1 ? "path" : "paths"}`}
      >
        <RouteList
          routes={row.routes}
          picked={picked}
          hover={hover}
          pick={pick}
          run={run}
          domains={domains}
          side="below"
        />
      </Section>

      <Section title={`Paths from ${company.name}`}>
        <Scope
          run={run}
          companyId={company.id}
          investorId={id}
          domains={domains}
          select={select}
          routes={row.routes}
          active={active}
          picked={picked}
          hover={hover}
          pick={pick}
        />
        {row.bridges.length > 0 && <Bridges list={row.bridges} domains={domains} select={select} />}
      </Section>

      <Section title="Fit with your next round">
        <Fit prefs={prefs} text={text} />
      </Section>
    </div>
  );
}

const MAX_SOURCES = 4;

/** The sources behind the pick, under its reason: where it was published and when, if dated. */
function Sources({ cites }: { cites: Cite[] }) {
  if (!cites.length) return null;
  const style =
    "inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border border-line px-2 font-mono text-[10.5px] text-dim";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {cites.slice(0, MAX_SOURCES).map((cite) => {
        const label = (
          <>
            <span className="max-w-44 truncate">{cite.name}</span>
            {cite.date && <span className="shrink-0 text-faint">{day(cite.date)}</span>}
          </>
        );
        return cite.url ? (
          <a
            key={cite.url}
            href={cite.url}
            target="_blank"
            rel="noreferrer"
            title={cite.url}
            className={`${style} transition hover:border-edge hover:text-text`}
          >
            {label}
          </a>
        ) : (
          <span key={cite.name} className={style}>
            {label}
          </span>
        );
      })}
      {cites.length > MAX_SOURCES && (
        <span className="font-mono text-[10.5px] text-faint">+{cites.length - MAX_SOURCES}</span>
      )}
    </div>
  );
}

/** The entities between investor and company; folded to a logo stack until opened. */
function Bridges(props: {
  list: Entity[];
  domains: Record<string, string>;
  select: (selection: Selection) => void;
}) {
  const { list, domains, select } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex h-8 w-full items-center gap-2.5 text-[13px] text-dim transition hover:text-text"
      >
        <span className="flex items-center">
          {list.slice(0, 4).map((b) => (
            <Mark
              key={b.id}
              entity={b}
              domain={domains[b.id]}
              size={20}
              className="-ml-1.5 ring-2 ring-ink first:ml-0"
            />
          ))}
        </span>
        <ChevronDown
          className={`ml-auto size-4 text-faint transition group-hover:text-text ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-2 flex animate-rise flex-wrap gap-1.5">
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => select({ kind: "node", id: b.id })}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-raise pr-2.5 pl-1 text-[12px] text-dim transition hover:border-edge hover:text-text"
            >
              <Mark entity={b} domain={domains[b.id]} size={20} />
              <span className="max-w-40 truncate">{b.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Section(props: { title: string; count?: string; children: React.ReactNode }) {
  const { title, count, children } = props;
  return (
    <section className="mt-7">
      <h3 className="mb-3 flex items-baseline gap-2 text-[13px] font-medium text-dim">
        {title}
        {count && <span className="font-mono text-[11px] font-normal text-faint">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

const KEYS = ["round", "geo", "lead", "sector"] as const;

/** Words that count as a mention of a preference in the agent's reasoning. */
const TERMS: Record<string, string[]> = {
  Lead: ["led", "lead"],
  "Co-lead": ["co-led", "co-lead"],
  Follow: ["alongside", "participat", "joined"],
  Nordics: [
    "nordic",
    "helsinki",
    "finland",
    "finnish",
    "sweden",
    "stockholm",
    "oslo",
    "copenhagen",
  ],
  Europe: ["europe"],
  UK: ["uk", "london", "british"],
  US: ["us", "u.s.", "american", "new york", "san francisco"],
  "B2B SaaS": ["saas", "b2b"],
  Software: ["software", "saas", "developer"],
  "Deep tech": ["deep-tech", "deep tech", "deeptech"],
};

function mentioned(label: string, text: string): boolean {
  if (label === "Anywhere") return true;
  const terms = TERMS[label] ?? [label.toLowerCase().replace(/s$/, "")];
  return terms.some((t) => {
    const safe = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(t.length < 4 ? `\\b${safe}\\b` : `\\b${safe}`, "i").test(text);
  });
}

function Fit({ prefs, text }: { prefs: Prefs; text: string }) {
  const items = KEYS.flatMap((key) =>
    answer(prefs, key)
      .split(", ")
      .filter(Boolean)
      .map((label) => ({ key, label, hit: mentioned(label, text) })),
  );

  if (!items.length) {
    return (
      <p className="text-[13px] text-faint">
        No preferences saved yet.{" "}
        <Link
          href="/?step=prefs"
          className="text-dim underline-offset-4 hover:text-text hover:underline"
        >
          Add them
        </Link>{" "}
        to see how this investor fits.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={`${item.key}-${item.label}`}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] ${
              item.hit ? "border-accent/40 bg-accent/10 text-text" : "border-line text-faint"
            }`}
          >
            {item.hit ? <Check className="size-3 text-accent" /> : <Minus className="size-3" />}
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-faint">Checked when the agent's reasoning mentions it.</p>
    </>
  );
}
