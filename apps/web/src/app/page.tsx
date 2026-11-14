import { ArrowUpRightIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { ApiStatus } from "@/components/api-status";

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
          <ApiStatus />
          <h1 className="hero-title">
            <span className="gradient-text">Bottega</span>
          </h1>
          <p className="hero-subtitle">Features land here.</p>
        </section>
      </main>

      <footer className="site-footer">Data from the Cala knowledge graph.</footer>
    </>
  );
}
