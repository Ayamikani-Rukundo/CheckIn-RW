import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createPublicClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { userId } = await request.json();
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: "Select a valid user account." }, { status: 400 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceKey) {
    return NextResponse.json({ error: "Server account-management settings are missing." }, { status: 500 });
  }
  if (!token) {
    return NextResponse.json({ error: "Sign in to manage user accounts." }, { status: 401 });
  }

  const publicClient = createPublicClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to manage user accounts." }, { status: 401 });
  }
  if (user.id === userId) {
    return NextResponse.json({ error: "You cannot delete the account you are currently using." }, { status: 400 });
  }

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: actor, error: profileError } = await admin
    .from("user_profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();
  if (profileError || actor?.role !== "Super Admin" || !actor.active) {
    return NextResponse.json({ error: "Only an active Super Admin can delete user accounts." }, { status: 403 });
  }

  const { data: target, error: targetError } = await admin
    .from("user_profiles")
    .select("role, active")
    .eq("id", userId)
    .single();
  if (targetError || !target) {
    return NextResponse.json({ error: "That user account no longer exists." }, { status: 404 });
  }

  if (target.role === "Super Admin" && target.active) {
    const { count, error: countError } = await admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "Super Admin")
      .eq("active", true);
    if (countError) {
      return NextResponse.json({ error: "Could not verify the remaining administrator accounts." }, { status: 500 });
    }
    if ((count || 0) <= 1) {
      return NextResponse.json({ error: "The last active Super Admin account cannot be deleted." }, { status: 400 });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
