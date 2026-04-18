// Supabase Edge Function: create staff user (coach/admin) with temp password.
// Security: requires caller to be authenticated AND is_admin() = true.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!url || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: "MISSING_ENV" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const email = String(payload?.email ?? "").trim().toLowerCase();
    const password = String(payload?.password ?? "").trim();
    const name = String(payload?.name ?? "").trim();
    const role = String(payload?.role ?? "coach").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "INVALID_EMAIL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: "WEAK_PASSWORD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role !== "coach" && role !== "admin") {
      return new Response(JSON.stringify({ error: "INVALID_ROLE" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Validate caller is admin using user's JWT (RLS protected)
    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const isAdminResp = await authed.rpc("is_admin");
    const isAdmin = Boolean(isAdminResp?.data);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "FORBIDDEN", details: { is_admin: isAdminResp?.data } }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Create auth user via service role
    const service = createClient(url, serviceKey);
    const createResp = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || undefined },
    });
    if (createResp.error || !createResp.data?.user) {
      return new Response(
        JSON.stringify({
          error: createResp.error?.message ?? "CREATE_FAILED",
          details: { code: (createResp.error as any)?.code, status: (createResp.error as any)?.status },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userId = createResp.data.user.id;

    // 3) Ensure profile row exists with staff role
    const upsertResp = await service.from("profiles").upsert(
      {
        id: userId,
        email,
        name: name || "Staff",
        role,
        status: "active",
      },
      { onConflict: "id" },
    );
    if (upsertResp.error) {
      return new Response(JSON.stringify({ error: upsertResp.error.message, details: { code: (upsertResp.error as any)?.code } }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, user_id: userId, email, role }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

