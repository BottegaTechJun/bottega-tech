"use client";

import type { Connection, Entity, Fact } from "@repo/shared";
import { FileText, GitCommitHorizontal, Link2, Waypoints } from "lucide-react";
import { Source } from "@/components/source";
import {
  Trace,
  TraceAction,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { day, initials } from "@/lib/format";
import { factKey, type Run } from "@/lib/matchup";
import type { Selection } from "./board";
import { kindLabel, relationText, roleColor, roleLabel } from "./style";

interface Props {
  run: Run;
  selection: NonNullable<Selection>;
  select: (selection: Selection) => void;
}

type Name = (id: string) => string;

/** Side panel body for a selection, in the same trace style as the agent steps. */
export function DetailPanel({ run, selection, select }: Props) {
  const name: Name = (id) => run.entities[id]?.name ?? "Unknown";

  if (selection.kind === "connection") {
    const link = run.graph?.connections.find((c) => c.id === selection.id);
    if (!link) return null;
    return <ConnectionView link={link} run={run} name={name} select={select} />;
  }

  if (selection.kind === "fact") {
    const fact = run.facts[selection.key];
    if (!fact) return null;
    return (
      <div className="animate-rise">
        <Head title={`${name(fact.from)} and ${name(fact.to)}`} sub="Seen while exploring" />
        <p className="mt-3 text-sm leading-relaxed text-dim">
          A Cala relation the agent saw. It is not part of the answer.
        </p>
        <Trace>
          <Group title="Relation" count={null} open>
            <FactLine fact={fact} name={name} />
          </Group>
        </Trace>
      </div>
    );
  }

  const entity = run.entities[selection.id];
  if (!entity) return null;
  const rank = run.graph?.investors.findIndex((p) => p.id === entity.id) ?? -1;
  const pick = rank >= 0 ? run.graph?.investors[rank] : undefined;
  const links =
    run.graph?.connections.filter(
      (c) => c.from === entity.id || c.to === entity.id || c.via.includes(entity.id),
    ) ?? [];
  const facts = Object.values(run.facts).filter((f) => f.from === entity.id || f.to === entity.id);

  return (
    <div className="animate-rise">
      <Head
        title={entity.name}
        sub={pick ? `Suggested lead #${rank + 1}` : roleLabel[entity.role]}
        entity={entity}
      />
      {pick && <p className="mt-3 text-sm leading-relaxed">{pick.why}</p>}

      <div className="mt-4">
        <Trace>
          {links.length > 0 && (
            <Group title="Connections" count={links.length} open>
              {links.map((c) => (
                <TraceAction key={c.id} onClick={() => select({ kind: "connection", id: c.id })}>
                  <TraceLine>
                    <TraceIcon>
                      <Waypoints />
                    </TraceIcon>
                    <TraceTitle>{c.label}</TraceTitle>
                    <TraceDescription>{kindLabel[c.kind]}</TraceDescription>
                  </TraceLine>
                </TraceAction>
              ))}
            </Group>
          )}
          {facts.length > 0 && (
            <Group title="From Cala" count={facts.length} open={links.length === 0}>
              {facts.slice(0, 40).map((f) => (
                <FactLine key={factKey(f)} fact={f} name={name} />
              ))}
            </Group>
          )}
        </Trace>
      </div>

      <p className="mt-6 font-mono text-[11px] text-faint">{entity.id}</p>
    </div>
  );
}

function Head({ title, sub, entity }: { title: string; sub: string; entity?: Entity }) {
  const color = entity ? roleColor[entity.role] : null;
  return (
    <div className="flex items-center gap-3">
      {entity && color && (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-medium"
          style={{ background: `${color}1f`, color }}
        >
          {initials(entity.name)}
        </span>
      )}
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-[13px] text-dim">{sub}</p>
      </div>
    </div>
  );
}

function Group(props: {
  title: string;
  count: number | null;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TraceCollapsible defaultOpen={props.open}>
      <TraceCollapsibleTrigger>
        <TraceLine status="active">
          <TraceTitle>{props.title}</TraceTitle>
          {props.count !== null && <TraceDescription>{props.count}</TraceDescription>}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>{props.children}</Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function ConnectionView(props: {
  link: Connection;
  run: Run;
  name: Name;
  select: Props["select"];
}) {
  const { link, run, name, select } = props;
  const chain = [link.from, ...link.via, link.to];
  return (
    <div className="animate-rise">
      <Head title={link.label} sub={kindLabel[link.kind]} />
      <p className="mt-3 text-sm leading-relaxed">{link.reasoning}</p>

      <div className="mt-4">
        <Trace>
          <Group title="Path" count={chain.length} open>
            {chain.map((id, i) => {
              const entity = run.entities[id];
              const color = entity ? roleColor[entity.role] : "#9a9aa2";
              return (
                <TraceAction
                  key={`${id}-${i === 0 ? "from" : i === chain.length - 1 ? "to" : "via"}`}
                  onClick={() => select({ kind: "node", id })}
                >
                  <TraceLine>
                    <TraceIcon>
                      <span className="size-2 rounded-[3px]" style={{ background: color }} />
                    </TraceIcon>
                    <TraceTitle>{name(id)}</TraceTitle>
                    <TraceDescription>{entity ? roleLabel[entity.role] : ""}</TraceDescription>
                  </TraceLine>
                </TraceAction>
              );
            })}
          </Group>

          {link.factors.length > 0 && (
            <Group title="Why it connects" count={link.factors.length} open>
              {link.factors.map((f) => (
                <TraceLine key={f}>
                  <TraceIcon>
                    <Link2 />
                  </TraceIcon>
                  <TraceTitle>{f}</TraceTitle>
                </TraceLine>
              ))}
            </Group>
          )}

          <Group title="Evidence" count={link.evidence.length} open>
            {link.evidence.length ? (
              link.evidence.map((cite) => (
                <TraceLine key={cite.url ?? cite.name}>
                  <TraceIcon>
                    <FileText />
                  </TraceIcon>
                  <TraceTitle>
                    {cite.url ? (
                      <a
                        href={cite.url}
                        target="_blank"
                        rel="noreferrer"
                        className="transition hover:text-text"
                      >
                        {cite.name}
                      </a>
                    ) : (
                      cite.name
                    )}
                  </TraceTitle>
                  <TraceDescription>{day(cite.date)}</TraceDescription>
                  <Source cites={[cite]} />
                </TraceLine>
              ))
            ) : (
              <TraceLine>
                <TraceTitle>Backed by the Cala relations below</TraceTitle>
              </TraceLine>
            )}
          </Group>

          {link.facts.length > 0 && (
            <Group title="From Cala" count={link.facts.length}>
              {link.facts.map((f) => (
                <FactLine key={factKey(f)} fact={f} name={name} />
              ))}
            </Group>
          )}
        </Trace>
      </div>
    </div>
  );
}

/** "Lifeline Ventures led Pre-Seed". A missing is_lead reads "joined", never "did not lead". */
function sentence(fact: Fact, name: Name): string {
  const from = name(fact.from);
  const to = name(fact.to);
  if (fact.relation === "PARTICIPATES_IN_FUNDING_ROUND") {
    if (fact.role === "ISSUER") return `${from} raised ${to}`;
    return `${from} ${fact.lead ? "led" : "joined"} ${to}`;
  }
  if (fact.relation === "PARTICIPATES_IN_EVENT") return `${from} is listed for ${to}`;
  if (fact.relation === "IS_CEO_OF") return `${from} is CEO of ${to}`;
  return `${from} ${relationText(fact.relation)} ${to}`;
}

function FactLine({ fact, name }: { fact: Fact; name: Name }) {
  const lead = fact.role === "INVESTOR" ? (fact.lead ? "Led" : "Participated") : null;
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <GitCommitHorizontal />
          </TraceIcon>
          <TraceTitle>{sentence(fact, name)}</TraceTitle>
          {lead && (
            <TraceDescription>
              <span className={fact.lead ? "text-accent" : undefined}>{lead}</span>
            </TraceDescription>
          )}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <div className="flex flex-col gap-1.5 py-1.5">
          {fact.sources.length ? (
            fact.sources.slice(0, 5).map((cite) => (
              <div key={cite.url ?? cite.name} className="flex items-center gap-2 text-[12px]">
                {cite.url ? (
                  <a
                    href={cite.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate text-dim transition hover:text-text"
                  >
                    {cite.name}
                  </a>
                ) : (
                  <span className="min-w-0 truncate text-dim">{cite.name}</span>
                )}
                <span className="font-mono text-[11px] text-faint">{day(cite.date)}</span>
                <span className="ml-auto">
                  <Source cites={[cite]} />
                </span>
              </div>
            ))
          ) : (
            <span className="text-[12px] text-faint">No source on this relation</span>
          )}
        </div>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
