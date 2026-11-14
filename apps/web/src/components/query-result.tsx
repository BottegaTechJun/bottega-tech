import type { QueryResponse } from "@repo/shared";
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

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function QueryResult({ data }: { data: QueryResponse }) {
  if (data.rows.length === 0) {
    return <p className="empty-state">No results for this query.</p>;
  }

  const columns = columnsOf(data.rows);

  return (
    <div className="stack">
      <div className="table-frame">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are static and have no stable id
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column}>{formatCell(row[column])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="caption">
        {data.rows.length} {data.rows.length === 1 ? "row" : "rows"}
      </p>
    </div>
  );
}
