import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type RowAction = { label: string; icon: LucideIcon; onClick: () => void; destructive?: boolean; disabled?: boolean };
export const actionCell = "sticky right-0 z-10 bg-card text-right no-print";
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  return <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
    <div className="hidden items-center sm:flex">{actions.slice(0, 2).map((a) => <Button key={a.label} variant="ghost" size="icon" title={a.label} aria-label={`${a.label} ${label}`} disabled={a.disabled} onClick={a.onClick}><a.icon className="h-4 w-4" /></Button>)}</div>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" title="Actions" aria-label={`Actions for ${label}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">{actions.map((a) => <DropdownMenuItem key={a.label} disabled={a.disabled} className={a.destructive ? "text-destructive focus:text-destructive" : ""} onSelect={a.onClick}><a.icon />{a.label}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>
  </div>;
}