import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ownerInput = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(100),
});

/** First-run only: creates the business + first Owner. Refuses once any business exists. */
export const setupFirstBusiness = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: cErr } = await supabaseAdmin.from("businesses").select("id", { count: "exact", head: true });
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) throw new Error("Setup has already been completed. Please sign in.");

    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (uErr || !created.user) throw new Error(uErr?.message ?? "Could not create user");

    const { data: biz, error: bErr } = await supabaseAdmin.from("businesses").insert({ name: "Gokul Cargo Movers" }).select("id").single();
    if (bErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(bErr.message);
    }
    const steps = [
      supabaseAdmin.from("business_members").insert({ business_id: biz.id, user_id: created.user.id, email: data.email, display_name: data.displayName, role: "owner" }),
      supabaseAdmin.from("business_settings").insert({ business_id: biz.id }),
      supabaseAdmin.from("payment_accounts").insert([
        { business_id: biz.id, kind: "cash", display_name: "Cash", system_key: "cash" },
        { business_id: biz.id, kind: "cash", display_name: "Cash Received by Narinder", system_key: "cash_narinder" },
      ]),
    ];
    for (const s of steps) {
      const { error } = await s;
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Owner adds another Owner (e.g. his brother). */
export const addOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ownerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: me, error: mErr } = await context.supabase
      .from("business_members").select("business_id, role").eq("user_id", context.userId).maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!me || me.role !== "owner") throw new Error("Only an Owner can add users.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (uErr || !created.user) throw new Error(uErr?.message ?? "Could not create user");
    const { error } = await supabaseAdmin.from("business_members").insert({
      business_id: me.business_id, user_id: created.user.id, email: data.email, display_name: data.displayName, role: "owner",
    });
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(error.message);
    }
    return { ok: true };
  });

async function requireOwner(context: { supabase: any; userId: string }) {
  const { data: me, error } = await context.supabase.from("business_members").select("business_id, role").eq("user_id", context.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!me || me.role !== "owner") throw new Error("Only an Owner can do this.");
  return me as { business_id: string; role: string };
}

/** Accounts that signed up but are not yet linked to the business. */
export const listPendingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);
    const { data: members, error: mErr } = await supabaseAdmin.from("business_members").select("user_id");
    if (mErr) throw new Error(mErr.message);
    const ids = new Set((members ?? []).map((m) => m.user_id));
    return data.users.filter((u) => !ids.has(u.id)).map((u) => ({
      id: u.id, email: u.email ?? "", name: (u.user_metadata?.display_name as string) ?? "", confirmed: !!u.email_confirmed_at, created_at: u.created_at,
    }));
  });

export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), role: z.enum(["owner", "admin", "staff"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (error || !u.user) throw new Error(error?.message ?? "User not found");
    const { error: iErr } = await supabaseAdmin.from("business_members").insert({
      business_id: me.business_id, user_id: data.userId, email: u.user.email, role: data.role,
      display_name: (u.user.user_metadata?.display_name as string) ?? u.user.email,
    });
    if (iErr) throw new Error(iErr.message);
    return { ok: true };
  });
