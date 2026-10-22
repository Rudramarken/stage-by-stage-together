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
