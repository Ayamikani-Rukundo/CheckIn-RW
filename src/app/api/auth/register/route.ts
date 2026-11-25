import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const body = await request.json();
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!code || fullName.length < 2 || !email.includes("@") || password.length < 8) {
    return NextResponse.json({ error: "Check the registration details and try again." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: verification, error: verificationError } = await supabase.rpc("verify_invitation", { p_code: code });
  if (verificationError || !verification?.length || !verification[0].valid) {
    return NextResponse.json({ error: "The invitation code is invalid or has expired." }, { status: 400 });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: verification[0].role },
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: "The account could not be created. Try another email address." }, { status: 400 });
  }

  const { error: claimError } = await supabase.rpc("claim_invitation", {
    p_code: code,
    p_user_id: created.user.id,
  });
  if (claimError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "The invitation could not be claimed." }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
