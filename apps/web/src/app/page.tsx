import { Explorer } from "@/components/explorer";

export default function Home() {
  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Bottega</h1>
        <p className="page-subtitle">Ask about companies, people, funding rounds and investors.</p>
      </header>
      <Explorer />
    </main>
  );
}
