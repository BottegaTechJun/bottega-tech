import { ArrowUpRightIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { Explorer } from "@/components/explorer";

export default function Home() {
  return (
    <>
      <div className="backdrop" aria-hidden="true" />

      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <SparklesIcon aria-hidden="true" />
            </span>
            Bottega
          </Link>
          <a
            href="https://cala.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="header-link"
          >
            Powered by Cala
            <ArrowUpRightIcon aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Companies · People · Funding rounds · Investors
          </span>
          <h1 className="hero-title">
            Ask anything about <span className="gradient-text">the startup world</span>
          </h1>
          <p className="hero-subtitle">
            Sourced answers from a live knowledge graph, in plain language or as structured queries.
          </p>
        </section>

        <Explorer />
      </main>

      <footer className="site-footer">Answers are sourced from the Cala knowledge graph.</footer>
    </>
  );
}
