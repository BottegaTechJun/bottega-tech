"use client";

import type { Entity } from "@repo/shared";
import type { Run } from "@/lib/matchup";
import type { Route } from "./graph";
import { Mark } from "./mark";

export interface Action {
  id: string;
  kind: "event" | "intro" | "person";
  /** The entity to act through: the event, your backer, or the person */
  target: Entity;
  title: string;
  why: string;
  /** Index of the first route this action comes from */
  route: number;
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Next steps read straight off the routes: meet at a shared event, ask your own backer on a
 * co-invest path for an intro, or reach out to the person a path runs through. One per target.
 */
export function actions(routes: Route[], run: Run, company: string, investor: string): Action[] {
  const name = (id: string) => run.entities[id]?.name ?? "";
  const out = new Map<string, Action>();
  routes.forEach((route, r) => {
    const middle = route.nodes.slice(1, -1).flatMap((id) => run.entities[id] ?? []);
    const last = route.hops.at(-1)?.c.label ?? route.label;
    const event = middle.find((e) => e.role === "event");
    const person = middle.find((e) => e.role === "person");
    const backer = middle.find((e) => e.role === "investor");
    const add = (action: Omit<Action, "id" | "route">) => {
      const id = `${action.kind}:${action.target.id}`;
      if (!out.has(id)) out.set(id, { ...action, id, route: r });
    };
    if (event) {
      add({
        kind: "event",
        target: event,
        title: `Meet at ${event.name}`,
        why: `${name(company)} and ${name(investor)} are both listed`,
      });
    }
    if (route.kind === "people" && person) {
      add({
        kind: "person",
        target: person,
        title: `Reach out to ${person.name}`,
        why: `${name(investor)} ${lower(last)}`,
      });
    }
    if (backer && route.kind !== "event") {
      add({
        kind: "intro",
        target: backer,
        title: `Ask ${backer.name} for an intro`,
        why: `Backs ${name(company)}, ${lower(last)}`,
      });
    }
  });
  const order = { event: 0, intro: 1, person: 2 };
  return [...out.values()].sort((a, b) => order[a.kind] - order[b.kind]);
}

interface Props {
  list: Action[];
  domains: Record<string, string>;
  /** Pins the route an action comes from */
  pick: (index: number | null) => void;
  picked: number | null;
}

/** Short rows of next steps, each with the logo of who or where to act through. */
export function Actions({ list, domains, pick, picked }: Props) {
  if (!list.length) return null;
  return (
    <ul className="flex flex-col">
      {list.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => pick(picked === a.route ? null : a.route)}
            title={a.why}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-raise/60"
          >
            <Mark entity={a.target} domain={domains[a.target.id]} size={26} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] text-text">{a.title}</span>
              <span className="block truncate text-[12px] text-faint">{a.why}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
