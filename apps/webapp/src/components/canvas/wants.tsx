import type { Prefs } from "@repo/shared";
import { PenLine } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { roundName } from "@/lib/format";
import { answer } from "@/lib/prefs";

interface Props {
  company: { name: string; website: string | null; hq: string | null };
  stage: string | null;
  prefs: Prefs;
}

const FIELDS = [
  { id: "round", label: "Round" },
  { id: "size", label: "Raise" },
  { id: "geo", label: "Where" },
  { id: "lead", label: "Role" },
  { id: "sector", label: "Sector" },
  { id: "timing", label: "Start" },
] as const;

/** The brief the agent searched with: who we are and what we want next. */
export function Wants({ company, stage, prefs }: Props) {
  const set = FIELDS.some((f) => prefs[f.id].length > 0);
  const meta = [stage ? roundName(stage) : null, company.hq].filter(Boolean).join(", ");

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-line px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Logo name={company.name} website={company.website} size="sm" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-medium">{company.name}</p>
          {meta && <p className="truncate text-[12px] text-faint">{meta}</p>}
        </div>
      </div>

      <span className="hidden h-8 w-px bg-line md:block" />

      {set ? (
        <dl className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2">
          {FIELDS.map((f) => {
            const value = answer(prefs, f.id);
            return (
              <div key={f.id} className="min-w-0 leading-tight">
                <dt className="text-[11px] text-faint">{f.label}</dt>
                <dd className={`truncate text-[13px] ${value ? "text-text" : "text-faint"}`}>
                  {value || "Any"}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="min-w-0 flex-1 text-[13px] text-dim">
          No preferences saved. Investors are matched on {company.name}'s profile only.
        </p>
      )}

      <Link href="/?step=prefs" className="btn-ghost h-8 shrink-0 px-3 text-[13px]">
        <PenLine className="size-3.5" />
        {set ? "Edit" : "Set preferences"}
      </Link>
    </div>
  );
}
