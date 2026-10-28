import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Truck, UserRound, Route as RouteIcon, MapPinned, FileText, Wallet, HandCoins,
  BookOpen, BookUser, Scale, BarChart3, Settings, History, Menu, LogOut, ShieldCheck, Star, FileSearch,
} from "lucide-react";
import { useNavFavourites, allowedFavourites } from "@/lib/nav-favourites";
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
  { to: "/routes", label: "Routes", icon: RouteIcon },
  { to: "/trips", label: "Trips", icon: MapPinned },
  { to: "/lr", label: "LR / Bilty Register", icon: FileText },
  { to: "/payments", label: "Payments & Receipts", icon: Wallet },
  { to: "/third-party", label: "Third-Party Payments", icon: HandCoins },
  // Transporter Settlements has no menu entry of its own: the transporter ledger, opening balance, manual entries, payments and
  // settlement table are inside Party Ledger -> "Transporter" tab. The old /transporter-settlements URL still works.
  { to: "/party-ledger", label: "Party / Transporter Ledger", icon: BookOpen },
  { to: "/history", label: "Party / Transporter History", icon: FileSearch },
  { to: "/driver-ledger", label: "Driver Ledger", icon: BookUser },
  { to: "/outstanding", label: "Outstanding Balances", icon: Scale },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Business Settings", icon: Settings },
  { to: "/audit", label: "Audit Log", icon: History },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useBusiness();
  const fav = useNavFavourites();
  const items = [...NAV, ...(role === "owner" ? [{ to: "/system-check", label: "System Check", icon: ShieldCheck }] as const : [])];
  // Favourites are only a bookmark: a starred key that is not in this user's allowed menu is ignored.
  const favKeys = allowedFavourites(fav.favourites, items.map((n) => n.to));
  const favItems = items.filter((n) => favKeys.includes(n.to));
  const restItems = items.filter((n) => !favKeys.includes(n.to));

  const row = (n: (typeof items)[number]) => {
    const active = path === n.to || path.startsWith(n.to + "/");
    const Icon = n.icon;
    const isFav = favKeys.includes(n.to);
    return (
      <div key={n.to} className={cn("group flex items-center rounded-md transition-colors", active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")}>
        <Link to={n.to} onClick={onNavigate} aria-current={active ? "page" : undefined}
          className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            active ? "text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground")}>
          <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", active && "text-sidebar-primary")} /><span className="min-w-0">{n.label}</span>
        </Link>
        <button type="button" data-testid={`fav-star-${n.to.slice(1)}`} aria-pressed={isFav} aria-label={isFav ? `Remove ${n.label} from favourites` : `Add ${n.label} to favourites`}
          title={isFav ? "Remove from favourites" : "Add to favourites"}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); fav.toggle(n.to, !isFav); }}
          className="mr-1 flex h-11 w-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <Star aria-hidden="true" className={cn("h-5 w-5", isFav ? "fill-yellow-400 text-yellow-400" : "text-sidebar-foreground/70 hover:text-yellow-400")} />
        </button>
      </div>
    );
  };

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 p-3">
      {fav.loadError && (
        <p role="status" title={fav.loadError} className="mb-1 rounded-md border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 text-xs text-sidebar-foreground">
          Favourites cannot be saved yet: the database setup (migration 0023) is not applied. Stars will work after it is.
        </p>
      )}
      {favItems.length > 0 && (
        <>
          <p className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70">Favourites</p>
          {favItems.map(row)}
          <div className="my-2 border-t border-sidebar-border" role="separator" />
        </>
      )}
      {restItems.map(row)}
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
