import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountFormSchema } from "@/lib/account-form";

const saveSchema = z.object({ account: accountFormSchema, creating: z.boolean() });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof saveSchema>) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...values } = data.account;
    if (data.creating) {
      // A stable UUID is reused on retries. RLS and name uniqueness remain database-enforced.
      const { data: prior, error: priorError } = await supabase.from("payment_accounts").select("id,created_by").eq("id", id).maybeSingle();
      if (priorError) throw new Error(priorError.message);
      if (prior) {
        if (prior.created_by !== context.userId) throw new Error("This account could not be saved. Please reopen the form.");
        return prior.id;
      }
      // Generated Insert requires business_id; a_stamp_business sets it from authenticated membership.
      const { data: saved, error } = await supabase.from("payment_accounts").insert({ ...values, id, kind: "bank" } as never).select("id").single();
      if (error) {
        if (error.code === "23505") {
          const { data: retry } = await supabase.from("payment_accounts").select("id,created_by").eq("id", id).maybeSingle();
          if (retry?.created_by === context.userId) return retry.id;
          throw new Error("An account with this name already exists. Use the existing account or a different name.");
        }
        throw new Error(error.message);
      }
      return saved.id;
    }
    const { data: existing, error: findError } = await supabase.from("payment_accounts").select("kind,display_name").eq("id", id).single();
    if (findError) throw new Error(findError.message);
    // Keep both permanent cash accounts and their identities unchanged.
    const payload = existing.kind === "cash"
      ? { opening_balance: values.opening_balance, opening_date: values.opening_date }
      : values;
    const { data: saved, error } = await supabase.from("payment_accounts").update(payload).eq("id", id).select("id").single();
    if (error) throw new Error(error.code === "23505" ? "An account with this name already exists." : error.message);
    return saved.id;
  });