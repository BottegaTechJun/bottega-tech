import { Check } from "lucide-react";

interface Props {
  done: number;
  total: number;
}

/** zero.inc style progress: a thin track, a moving marker and a count pill. */
export function ProgressBar({ done, total }: Props) {
  const pct = (done / total) * 100;
  return (
    <div className="relative pt-9">
      <div
        className="absolute top-0 -translate-x-1/2 transition-[left] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ left: `clamp(1.25rem, ${pct}%, calc(100% - 1.25rem))` }}
      >
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-accent px-2 font-mono text-[11px] font-medium text-accent-ink">
          <Check className="size-3" strokeWidth={2.5} />
          {done}/{total}
        </span>
      </div>
      <div className="relative h-1 rounded-full bg-hover">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${pct}%` }}
        />
        {Array.from({ length: total - 1 }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed notches
            key={i}
            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-panel"
            style={{ left: `${((i + 1) / total) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
