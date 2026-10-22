import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Truck, UserRound, Route as RouteIcon, MapPinned, FileText, Wallet, HandCoins,
  Handshake, BookOpen, BookUser, Scale, BarChart3, Settings, History, Menu, LogOut, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/parties", label: "Parties", icon: Users },
  { to: "/vehicles", label: "Vehicles", icon: Truck },
  { to: "/drivers", label: "Drivers", icon: UserRound },
  { to: "/routes", label: "Routes", icon: RouteIcon },
  { to: "/trips", label: "Trips", icon: MapPinned },
  { to: "/lr", label: "LR / Bilty Register", icon: FileText },
  { to: "/payments", label: "Payments & Receipts", icon: Wallet },
  { to: "/third-party", label: "Third-Party Payments", icon: HandCoins },
  { to: "/transporter-settlements", label: "Transporter Settlements", icon: Handshake },
  { to: "/party-ledger", label: "Party Ledger", icon: BookOpen },
  { to: "/driver-ledger", label: "Driver Ledger", icon: BookUser },
  { to: "/outstanding", label: "Outstanding Balances", icon: Scale },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Business Settings", icon: Settings },
  { to: "/audit", label: "Audit Log", icon: History },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useBusiness();
  const items = [...NAV, ...(role === "owner" ? [{ to: "/system-check", label: "System Check", icon: ShieldCheck }] as const : [])];
  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map((n) => {
        const active = path === n.to || path.startsWith(n.to + "/");
        const Icon = n.icon;
        return (
          <Link key={n.to} to={n.to} onClick={onNavigate}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/60")}>
            <Icon className={cn("h-4 w-4", active && "text-sidebar-primary")} />{n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="border-b border-sidebar-border px-4 py-4">
      <p className="font-display text-lg font-semibold text-sidebar-accent-foreground">Gokul Cargo Movers</p>
      <p className="text-xs text-sidebar-foreground/70">Transport Management</p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { email } = useBusiness();
  const footer = (
    <div className="border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/80">
      <p className="truncate">{email}</p>
      <button className="mt-2 flex items-center gap-2 hover:text-sidebar-accent-foreground" onClick={() => supabase.auth.signOut()}>
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </button>
    </div>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <Brand /><div className="flex-1 overflow-y-auto"><NavList /></div>{footer}
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col border-sidebar-border bg-sidebar p-0">
          <Brand /><div className="flex-1 overflow-y-auto"><NavList onNavigate={() => setOpen(false)} /></div>{footer}
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
          <span className="font-display font-semibold text-primary">Gokul Cargo Movers</span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
