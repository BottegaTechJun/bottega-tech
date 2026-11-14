import type { SearchResponse } from "@repo/shared";
import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SearchResult({ data }: { data: SearchResponse }) {
  return (
    <div className="stack">
      <Card>
        <CardHeader>
          <CardTitle>Answer</CardTitle>
        </CardHeader>
        <CardContent className="stack">
          <div className="markdown">
            <Markdown>{data.answer}</Markdown>
          </div>
          {data.entities.length > 0 && (
            <div className="badge-list">
              {data.entities.map((entity) => (
                <Badge key={entity.id} variant="secondary" title={entity.entityType}>
                  {entity.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data.sources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="source-list">
              {data.sources.map((source) => (
                <li key={source.document.url}>
                  <a
                    href={source.document.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-link"
                  >
                    {source.document.name}
                  </a>
                  <span className="caption">{source.name}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
