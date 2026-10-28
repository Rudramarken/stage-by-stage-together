import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PaymentsList } from "@/components/app/PaymentsList";
import { AccountStatement } from "@/components/app/AccountStatement";
import { AccountCards } from "@/components/app/AccountCards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => pageHead("Payments & Receipts — Gokul Cargo Movers", "Payments & Receipts records for Gokul Cargo Movers transport management."),
  component: PaymentsPage,
});

function PaymentsPage() {
  const [tab, setTab] = useState("entries");
  const [accountId, setAccountId] = useState("");
  return (
    <div className="space-y-6">
      {/* One visible card per account (Cash, Cash Received by Narinder, every bank account). No dropdown. */}
      <AccountCards selectedId={accountId} onView={(id) => { setAccountId(id); setTab("statement"); window.setTimeout(() => document.getElementById("account-statement")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="entries">All entries</TabsTrigger>
          <TabsTrigger value="statement">Account transactions &amp; statement</TabsTrigger>
        </TabsList>
        <TabsContent value="entries"><PaymentsList /></TabsContent>
        <TabsContent value="statement"><div id="account-statement"><AccountStatement accountId={accountId} /></div></TabsContent>
      </Tabs>
    </div>
  );
}
