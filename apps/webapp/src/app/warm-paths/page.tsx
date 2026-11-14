import { ArrowLeft, Network } from "lucide-react";
import Link from "next/link";
import { Shell } from "@/components/shell";

/** Placeholder until the warm-paths board lands. */
export default function WarmPaths() {
  return (
    <Shell active="paths">
      <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-line bg-raise">
          <Network className="size-6 text-accent" strokeWidth={1.5} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Warm paths board</h1>
          <p className="mt-1 text-sm text-dim">
            Your investors, their shared rounds, and the leads behind them.
          </p>
        </div>
        <Link href="/" className="btn-ghost">
          <ArrowLeft className="size-4" />
          Back to setup
        </Link>
      </div>
    </Shell>
  );
}
