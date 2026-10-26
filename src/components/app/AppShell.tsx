import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Truck, UserRound, MapPinned, FileText, Wallet, HandCoins,
  Handshake, BookOpen, BookUser, Scale, BarChart3, Settings, History, Menu, LogOut, ShieldCheck, Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/parties", label: "Parties", icon: Users },
  { to: "/vehicles", label: "Vehicles", icon: Truck },
  { to: "/drivers", label: "Drivers", icon: UserRound },
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

// Favourite pages are remembered in this browser (per signed-in e-mail). Losing them only resets the menu order.
function useFavourites(email: string | null | undefined) {
  const key = `nav-favourites:v1:${email ?? "anon"}`;
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => {
    try { const raw = window.localStorage.getItem(key); const parsed = raw ? JSON.parse(raw) : []; setFavs(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []); } catch { setFavs([]); }
  }, [key]);
  const toggle = (to: string) => setFavs((prev) => {
    const next = prev.includes(to) ? prev.filter((x) => x !== to) : [...prev, to];
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage blocked: favourites just won't persist */ }
    return next;
  });
  return { favs, toggle };
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { role, email } = useBusiness();
  const { favs, toggle } = useFavourites(email);
  const base = [...NAV, ...(role === "owner" ? [{ to: "/system-check", label: "System Check", icon: ShieldCheck }] as const : [])];
  // Favourites first (in menu order), then the rest (in menu order).
  const items = [...base.filter((n) => favs.includes(n.to)), ...base.filter((n) => !favs.includes(n.to))];
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 p-3">
      {items.map((n) => {
        const active = path === n.to || path.startsWith(n.to + "/");
        const Icon = n.icon;
        const fav = favs.includes(n.to);
        return (
          <div key={n.to} className="flex items-center gap-1">
            <Link to={n.to} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/60")}>
              <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", active && "text-sidebar-primary")} /><span className="min-w-0">{n.label}</span>
            </Link>
            <button type="button" onClick={() => toggle(n.to)} aria-pressed={fav} aria-label={fav ? `Remove ${n.label} from favourites` : `Add ${n.label} to favourites`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              <Star aria-hidden="true" className={cn("h-4 w-4", fav ? "fill-yellow-400 text-yellow-400" : "text-sidebar-foreground/60")} />
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="border-b border-sidebar-border px-5 py-6">
      <p className="font-display text-lg font-semibold text-sidebar-accent-foreground">Gokul Cargo Movers</p>
      <p className="mt-1 text-xs text-sidebar-foreground">Transport Management</p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { email } = useBusiness();
  const footer = (
    <div className="border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/80">
      <p className="truncate">{email}</p>
      <Button variant="ghost" className="mt-2 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={() => supabase.auth.signOut()}>
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </Button>
    </div>
  );
  return (
    <div className="flex min-h-dvh">
      <a href="#main-content" className="skip-link no-print">Skip to main content</a>
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <Brand /><div className="flex-1 overflow-y-auto"><NavList /></div>{footer}
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Main navigation</SheetTitle>
          <SheetDescription className="sr-only">Gokul Cargo Movers pages and account menu.</SheetDescription>
          <Brand /><div className="flex-1 overflow-y-auto"><NavList onNavigate={() => setOpen(false)} /></div>{footer}
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><Menu /></Button>
          <span className="min-w-0 truncate font-display font-semibold text-primary">Gokul Cargo Movers</span>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-7xl flex-1 p-4 outline-none sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
