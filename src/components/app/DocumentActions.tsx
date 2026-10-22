import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, Pencil, Printer, Ban, Trash2 } from "lucide-react";
import { useBusiness } from "@/lib/business";
import { RowActions, type RowAction } from "./RowActions";
import { RemovalDialog, type RemovalTarget } from "./RemovalDialog";

export function DocumentActions({ kind, row }: { kind: "lr" | "trip"; row: { id: string; status: string; lr_number?: string; trip_number?: string } }) {
  const navigate = useNavigate(); const { role } = useBusiness();
  const [target, setTarget] = useState<RemovalTarget | null>(null);
  const label = row.lr_number ?? row.trip_number ?? "Record";
  const view = (print = false) => {
    if (print) sessionStorage.setItem("print-document", row.id);
    if (kind === "lr") navigate({ to: "/lr/$id", params: { id: row.id } });
    else navigate({ to: "/trips/$id", params: { id: row.id } });
  };
  const actions: RowAction[] = [
    { label: "View", icon: Eye, onClick: () => view() },
    { label: "Edit", icon: Pencil, disabled: row.status === "cancelled", onClick: () => kind === "lr" ? navigate({ to: "/lr/$id/edit", params: { id: row.id } }) : navigate({ to: "/trips/$id/edit", params: { id: row.id } }) },
    { label: "Print", icon: Printer, onClick: () => view(true) },
    { label: "Cancel", icon: Ban, disabled: row.status === "cancelled", destructive: true, onClick: () => setTarget({ table: kind === "lr" ? "lrs" : "trips", id: row.id, label, action: "cancel" }) },
    ...(role === "owner" ? [{ label: "Delete permanently", icon: Trash2, destructive: true, onClick: () => setTarget({ table: kind === "lr" ? "lrs" : "trips", id: row.id, label, action: "delete" as const }) }] : []),
  ];
  return <><RowActions label={label} actions={actions} /><RemovalDialog target={target} onClose={() => setTarget(null)} /></>;
}