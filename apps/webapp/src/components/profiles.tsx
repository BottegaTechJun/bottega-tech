"use client";

import type { ProfileSummary } from "@repo/shared";
import { X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { announce, api, PROFILES_CHANGED } from "@/lib/api";
import { summary } from "@/lib/prefs";
import { useProgress } from "@/lib/store";
import { Logo } from "./logo";

/** Saved profiles in the sidebar. Picking one opens its canvas and makes it the current one. */
export function Profiles({ active }: { active?: string | null }) {
  const { setState } = useProgress();
  const [list, setList] = useState<ProfileSummary[] | null>(null);
  const [sure, setSure] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .profiles()
      .then(setList)
      .catch(() => setList([]));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(PROFILES_CHANGED, load);
    return () => window.removeEventListener(PROFILES_CHANGED, load);
  }, [load]);

  const pick = (p: ProfileSummary) =>
    setState({
      company: p.company,
      prefs: p.prefs,
      confirmed: true,
      prefsDone: true,
      profileId: p.id,
    });

  const remove = async (id: string) => {
    setSure(null);
    await api.remove(id).catch(() => undefined);
    setState((s) => (s.profileId === id ? { ...s, profileId: null } : s));
    announce();
  };

  if (!list?.length) return null;

  return (
    <div className="mt-6 flex min-h-0 flex-col">
      <p className="px-2.5 pb-1.5 text-xs text-faint">Profiles</p>
      <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {list.map((p) => (
          <li key={p.id} className="group relative">
            <Link
              href={`/warm-paths?profile=${p.id}`}
              onClick={() => pick(p)}
              aria-current={active === p.id ? "page" : undefined}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 pr-8 transition hover:bg-raise aria-[current=page]:bg-raise"
            >
              <Logo name={p.company.name} website={p.company.website} size="xs" />
              <span className="min-w-0">
                <span className="block truncate text-sm">{p.company.name}</span>
                <span className="block truncate text-xs text-faint">{summary(p.prefs)}</span>
              </span>
            </Link>
            {sure === p.id ? (
              <button
                type="button"
                onClick={() => remove(p.id)}
                onBlur={() => setSure(null)}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[11px] text-text"
              >
                Delete
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Delete ${p.company.name}`}
                onClick={() => setSure(p.id)}
                className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-faint opacity-0 transition group-hover:opacity-100 hover:text-text focus:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
