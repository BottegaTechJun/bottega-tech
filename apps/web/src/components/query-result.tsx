import type { QueryResponse } from "@repo/shared";
import { SearchXIcon, Table2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Rows are free-form, so columns are the union of every row's keys, in first-seen order. */
function columnsOf(rows: QueryResponse["rows"]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

function formatHeader(column: string): string {
  return column.replace(/_/g, " ");
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (Array.isArray(value)) return value.map(formatCell).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function QueryResult({ data }: { data: QueryResponse }) {
  if (data.rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <SearchXIcon aria-hidden="true" />
        </div>
        <p className="empty-title">No matches</p>
        <p className="empty-text">Try loosening a filter or checking the field names.</p>
      </div>
    );
  }

  const columns = columnsOf(data.rows);

  return (
    <div className="stack stagger">
      <Card>
        <CardHeader>
          <div className="card-heading">
            <span className="card-icon">
              <Table2Icon aria-hidden="true" />
            </span>
            <CardTitle>Results</CardTitle>
            <Badge variant="secondary">{data.rows.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="table-frame">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column} className="capitalize first:pl-4 last:pr-4">
                      {formatHeader(column)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are static and have no stable id
                  <TableRow key={index}>
                    {columns.map((column) => (
                      <TableCell
                        key={column}
                        title={formatCell(row[column])}
                        className="first:pl-4 first:font-medium last:pr-4"
                      >
                        {formatCell(row[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
