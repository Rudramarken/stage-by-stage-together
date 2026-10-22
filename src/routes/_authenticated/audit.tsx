import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatINR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => pageHead("Audit Log — Gokul Cargo Movers", "Audit Log records for Gokul Cargo Movers transport management."),
  component: AuditPage,
});

const PAGE = 50;

function AuditPage() {
  const [page, setPage] = useState(0);
  const members = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_members").select("user_id, display_name, email");
      if (error) throw error;
      return data;
    },
  });
  const q = useQuery({
    queryKey: ["audit", page],
    queryFn: async () => {
      const { data, error, count } = await supabase.from("audit_logs").select("*", { count: "exact" })
        .order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });
  const who = (id: string | null) => members.data?.find((m) => m.user_id === id)?.display_name ?? (id ? "User" : "System");
  return (
    <div>
      <PageHeader title="Audit Log" description="Read-only history of every change. Nothing here can be edited." />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        q.data.rows.length === 0 ? <EmptyState title="No changes recorded yet" /> : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.data.rows.map((r) => {
                  const d = (r.new_data ?? r.old_data) as Record<string, unknown> | null;
                  const label = d ? String(d.lr_number ?? d.trip_number ?? d.name ?? d.registration_number ?? d.display_name ?? d.origin ?? "") : "";
                  const changed = r.action === "UPDATE" && r.old_data && r.new_data
                    ? Object.keys(r.new_data as object).filter((k) => !["updated_at"].includes(k) && JSON.stringify((r.old_data as any)[k]) !== JSON.stringify((r.new_data as any)[k]))
                    : [];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                      <TableCell>{who(r.user_id)}</TableCell>
                      <TableCell><StatusBadge tone={r.action === "INSERT" ? "success" : r.action === "DELETE" ? "danger" : "info"}>{r.action === "INSERT" ? "Created" : r.action === "UPDATE" ? "Changed" : r.action}</StatusBadge></TableCell>
                      <TableCell>{r.table_name.replace(/_/g, " ")} {label && <b>· {label}</b>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{changed.length ? `Changed: ${changed.join(", ")}` : r.action === "DELETE_PERMANENTLY" && d ? `Freight ${formatINR(Number(d.final_freight ?? 0))} · Payable ${formatINR(Number(d.freight_payable ?? 0))} · Commission ${formatINR(Number(d.commission_amount ?? 0))}` : ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-end gap-2 border-t px-3 py-2 text-sm">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= q.data.count} onClick={() => setPage(page + 1)}>Older</Button>
            </div>
          </div>
        )}
    </div>
  );
}
