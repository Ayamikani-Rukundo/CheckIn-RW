import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { code } = await request.json();
  if (typeof code !== "string" || code.trim().length < 6) {
    return NextResponse.json({ error: "Enter a valid invitation code." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase.rpc("verify_invitation", { p_code: code.trim() });

  if (error || !data?.length || !data[0].valid) {
    return NextResponse.json({ error: "The invitation code is invalid or has expired." }, { status: 400 });
  }

  return NextResponse.json({ role: data[0].role });
}
