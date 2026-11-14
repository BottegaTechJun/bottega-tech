import type { CompanyMatch } from "@repo/shared";
import { ArrowRight, PenLine } from "lucide-react";
import Link from "next/link";
import { answer, type Prefs } from "@/lib/prefs";
import { Logo } from "./logo";

interface Props {
  company: CompanyMatch;
  prefs: Prefs;
  edit: () => void;
}

const rows: { id: keyof Prefs; label: string }[] = [
  { id: "round", label: "Round" },
  { id: "size", label: "Size" },
  { id: "lead", label: "Role" },
  { id: "geo", label: "Region" },
  { id: "sector", label: "Sector" },
  { id: "timing", label: "Timing" },
];

export function DoneStep({ company, prefs, edit }: Props) {
  return (
    <div className="mx-auto grid w-full max-w-4xl animate-rise grid-cols-1 gap-3 md:grid-cols-5">
      <section className="card flex flex-col justify-between gap-10 p-6 md:col-span-2">
        <Logo name={company.name} website={company.website} size="lg" />
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">You're set.</h2>
          <p className="mt-1 text-dim">{company.name}</p>
        </div>
      </section>

      <section className="card p-6 md:col-span-3">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
          {rows.map((row) => (
            <div key={row.id}>
              <dt className="text-xs text-faint">{row.label}</dt>
              <dd className="mt-1 text-sm">{answer(prefs, row.id) || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="flex items-center justify-end gap-2 pt-3 md:col-span-5">
        <button type="button" className="btn-ghost" onClick={edit}>
          <PenLine className="size-4" />
          Edit
        </button>
        <Link href="/warm-paths" className="btn-primary">
          Open warm paths
          <ArrowRight className="size-4" />
        </Link>
      </footer>
    </div>
  );
}
