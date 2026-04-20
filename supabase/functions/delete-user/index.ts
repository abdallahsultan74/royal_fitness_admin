// Supabase Edge Function: delete user permanently (auth.users) using service_role.
// Security: requires caller JWT and staff role (is_admin() OR is_coach()).
// Deleting a staff user (admin/coach) requires is_admin() = true.
// Deploy with --no-verify-jwt if your project uses ES256 access tokens.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  user_id?: string;
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

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const userId = String(payload?.user_id ?? "").trim();
    if (!userId) {
      return new Response(JSON.stringify({ error: "MISSING_USER_ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate caller using user's JWT.
    const authed = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const [{ data: caller }, isAdminResp, isCoachResp] = await Promise.all([
      authed.auth.getUser(),
      authed.rpc("is_admin"),
      authed.rpc("is_coach"),
    ]);
    const callerId = caller?.user?.id ?? null;
    const isAdmin = Boolean(isAdminResp?.data);
    const isCoach = Boolean(isCoachResp?.data);
    if (!isAdmin && !isCoach) {
      return new Response(JSON.stringify({ error: "FORBIDDEN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (callerId && callerId === userId) {
      return new Response(JSON.stringify({ error: "CANNOT_DELETE_SELF" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(url, serviceKey);

    // Never allow deleting admins (safety).
    const profResp = await service
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const targetRole = String(profResp.data?.role ?? "user").toLowerCase();
    if (targetRole === "admin") {
      return new Response(JSON.stringify({ error: "FORBIDDEN_DELETE_ADMIN" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If target is staff (coach), require admin.
    if ((targetRole === "admin" || targetRole === "coach") && !isAdmin) {
      return new Response(JSON.stringify({ error: "FORBIDDEN_DELETE_STAFF" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const delResp = await service.auth.admin.deleteUser(userId);
    if (delResp.error) {
      return new Response(
        JSON.stringify({
          error: delResp.error.message ?? "DELETE_FAILED",
          details: {
            code: (delResp.error as any)?.code,
            status: (delResp.error as any)?.status,
          },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

