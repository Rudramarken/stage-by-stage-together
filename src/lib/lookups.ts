import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function useTable<T extends "parties" | "drivers" | "vehicles" | "transporters" | "payment_accounts" | "routes">(t: T, order: string) {
  return useQuery({
    queryKey: [t],
    queryFn: async () => {
      const { data, error } = await supabase.from(t).select("*").order(order);
      if (error) throw error;
      return data as any[];
    },
  });
}

export const useParties = () => useTable("parties", "name");
export const useDrivers = () => useTable("drivers", "name");
export const useVehicles = () => useTable("vehicles", "registration_number");
export const useTransporters = () => useTable("transporters", "name");
export const useAccounts = () => useTable("payment_accounts", "display_name");
export const useRoutes = () => useTable("routes", "origin");

/** Current balance per cash/bank account (opening balance + movements on/after the opening date). */
export const useAccountBalances = () => useQuery({
  queryKey: ["payment_accounts", "balances"],
  queryFn: async () => {
    const { data, error } = await supabase.from("payment_account_balances").select("*");
    if (error) throw error;
    return data;
  },
});

/** Every in/out movement on cash & bank accounts (payments, expenses, advances, salary, commission). Paged past the 1000-row API cap. */
export const useAccountMovements = () => useQuery({
  queryKey: ["payment_accounts", "movements"],
  queryFn: async () => {
    const out: { account_id: string | null; entry_date: string | null; signed_amount: number | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("account_movements").select("account_id, entry_date, signed_amount").order("entry_date").order("source_id").range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  },
});

export const nameOf = (list: any[] | undefined, id: string | null | undefined, key = "name") =>
  (id && list?.find((x) => x.id === id)?.[key]) || "";

export const TRIP_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "muted" }, booked: { label: "Booked", tone: "info" }, in_transit: { label: "In Transit", tone: "warning" },
  delivered: { label: "Delivered", tone: "success" }, completed: { label: "Completed", tone: "success" }, cancelled: { label: "Cancelled", tone: "danger" },
};
export const LR_DELIVERY: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "warning" }, in_transit: { label: "In Transit", tone: "info" }, delivered: { label: "Delivered", tone: "success" },
};
export const FREIGHT_TYPE: Record<string, string> = { paid: "Paid (consignor pays)", to_pay: "To-Pay (consignee pays)", tbb: "TBB (bill later)" };
export const PAYMENT_TYPE: Record<string, string> = {
  customer_receipt: "Customer Receipt", transporter_payment: "Transporter/Supplier Payment", advance_paid: "Advance Paid",
  advance_received: "Advance Received", third_party_receipt: "Third-Party Receipt",
};
export const EXPENSE_CATEGORIES = ["Diesel/Fuel", "Toll", "Driver Food", "Loading/Unloading", "Parking", "Repairs", "Other"];
export const PAY_MODES = [{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "neft", label: "NEFT/RTGS/IMPS" }, { value: "cheque", label: "Cheque" }, { value: "other", label: "Other" }];

export async function createPartyInline(name: string, role: string): Promise<string> {
  const clean = name.trim();
  const { data: existing } = await supabase.from("parties").select("id").ilike("name", clean).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase.from("parties").insert({ name: clean, roles: [role] } as never).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function createTransporterInline(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_transporter", { p_name: name });
  if (error) throw error;
  return data as string;
}
