import { BookOpen, Network, Rocket } from "lucide-react";
import Link from "next/link";
import { BottegaMark } from "./bottega-mark";
import { Profiles } from "./profiles";
import { UserMenu } from "./user-menu";

interface Props {
  active: "start" | "paths";
  /** Saved profile open on this page, highlighted in the sidebar */
  profile?: string | null;
  /** Shown at the bottom of the sidebar once a company is picked */
  company?: React.ReactNode;
  /** Panel beside the main panel, on the page background (e.g. the agent trace) */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/** Cala-console style frame: dark sidebar on the left, rounded inset panel for content. */
export function Shell({ active, profile, company, aside, children }: Props) {
  const items = [
    { id: "start", href: "/", label: "Home", icon: Rocket },
    { id: "paths", href: "/warm-paths", label: "Warm paths", icon: Network },
  ] as const;

  return (
    <div className="flex min-h-[100dvh]">
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col px-3 py-4 md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2.5 pb-6">
          <BottegaMark className="size-7 shrink-0" />
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
        </nav>

        <Profiles active={profile} />

        <div className="mt-auto flex flex-col gap-3 pt-4">
          {company}
          <UserMenu />
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

      <main className="min-w-0 flex-1 overflow-x-clip md:py-2 md:pr-2">
        <nav className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-line bg-ink/90 px-4 backdrop-blur md:hidden">
          <Link href="/" aria-label="Bottega" className="mr-2">
            <BottegaMark className="size-7" />
          </Link>
          {items.map(({ id, href, label }) => (
            <Link
              key={id}
              href={href}
              aria-current={active === id ? "page" : undefined}
              className="flex h-8 items-center rounded-full px-3 text-sm text-dim transition hover:text-text aria-[current=page]:bg-raise aria-[current=page]:text-text"
            >
              {label}
            </Link>
          ))}
          <div className="ml-auto">
            <UserMenu compact />
          </div>
        </nav>
        <div className="flex min-w-0">
          <div className="min-h-[100dvh] min-w-0 flex-1 bg-panel md:min-h-[calc(100dvh-1rem)] md:overflow-hidden md:rounded-[20px] md:border md:border-line">
            {children}
          </div>
          {aside}
        </div>
      </main>
    </div>
  );
}
