import type { SearchResponse } from "@repo/shared";
import { BookOpenIcon, ExternalLinkIcon, SparklesIcon } from "lucide-react";
import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "Publisher · host", without repeating the host when the publisher name already is one. */
function sourceCaption(name: string, url: string): string {
  const host = hostnameOf(url);
  return name.toLowerCase().replace(/^www\./, "") === host ? host : `${name} · ${host}`;
}

export function SearchResult({ data }: { data: SearchResponse }) {
  return (
    <div className="stack stagger">
      <Card className="answer-card">
        <CardHeader>
          <div className="card-heading">
            <span className="card-icon">
              <SparklesIcon aria-hidden="true" />
            </span>
            <CardTitle>Answer</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="markdown">
            <Markdown>{data.answer}</Markdown>
          </div>
        </CardContent>
      </Card>

      {data.entities.length > 0 && (
        <section className="section">
          <h2 className="section-title">Mentioned</h2>
          <div className="badge-list">
            {data.entities.map((entity) => (
              <Badge key={entity.id} variant="outline">
                {entity.name}
                <span className="entity-type">{entity.entityType}</span>
              </Badge>
            ))}
          </div>
        </section>
      )}

      {data.sources.length > 0 && (
        <Card>
          <CardHeader>
            <div className="card-heading">
              <span className="card-icon">
                <BookOpenIcon aria-hidden="true" />
              </span>
              <CardTitle>Sources</CardTitle>
              <Badge variant="secondary">{data.sources.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="source-list">
              {data.sources.map((source, index) => (
                <li key={source.document.url} className="source-item">
                  <span className="source-index">{index + 1}</span>
                  <div className="source-body">
                    <a
                      href={source.document.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-link"
                    >
                      {source.document.name}
                      <ExternalLinkIcon aria-hidden="true" />
                    </a>
                    <span className="caption">
                      {sourceCaption(source.name, source.document.url)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
