import { BookOpen, Compass, Network, Rocket } from "lucide-react";
import Link from "next/link";

interface Props {
  active: "start" | "paths";
  /** Shown at the bottom of the sidebar once a company is picked */
  company?: React.ReactNode;
  children: React.ReactNode;
}

/** Cala-console style frame: dark sidebar on the left, rounded inset panel for content. */
export function Shell({ active, company, children }: Props) {
  const items = [
    { id: "start", href: "/", label: "Get started", icon: Rocket },
    { id: "paths", href: "/warm-paths", label: "Warm paths", icon: Network },
  ] as const;

  return (
    <div className="flex min-h-[100dvh]">
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col px-3 py-4 md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2.5 pb-6">
          <span className="grid size-7 place-items-center rounded-lg bg-text font-mono text-sm font-semibold text-ink">
            B
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Bottega</span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {items.map(({ id, href, label, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              aria-current={active === id ? "page" : undefined}
              className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-dim transition hover:bg-raise hover:text-text aria-[current=page]:bg-raise aria-[current=page]:text-text"
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
          <span className="flex h-9 items-center gap-2.5 px-2.5 text-sm text-faint">
            <Compass className="size-4" strokeWidth={1.75} />
            Explore
          </span>
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {company}
          <a
            href="https://cala.ai"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-faint transition hover:text-dim"
          >
            <BookOpen className="size-4" strokeWidth={1.75} />
            Data by Cala
          </a>
        </div>
      </aside>

      <main className="min-w-0 flex-1 md:py-2 md:pr-2">
        <div className="min-h-[100dvh] bg-panel md:min-h-[calc(100dvh-1rem)] md:rounded-[20px] md:border md:border-line">
          {children}
        </div>
      </main>
    </div>
  );
}
