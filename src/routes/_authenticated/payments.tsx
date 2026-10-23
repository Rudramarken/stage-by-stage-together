import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { PaymentsList } from "@/components/app/PaymentsList";
import { AccountStatement } from "@/components/app/AccountStatement";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => pageHead("Payments & Receipts — Gokul Cargo Movers", "Payments & Receipts records for Gokul Cargo Movers transport management."),
  component: () => (
    <Tabs defaultValue="entries">
      <TabsList className="mb-4">
        <TabsTrigger value="entries">All entries</TabsTrigger>
        <TabsTrigger value="statement">Bank / Cash statement</TabsTrigger>
      </TabsList>
      <TabsContent value="entries"><PaymentsList /></TabsContent>
      <TabsContent value="statement"><AccountStatement /></TabsContent>
    </Tabs>
  ),
});
