import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  // CSRF guard: only honor sign-out requests that originate from this site, so a
  // malicious page can't auto-submit a POST and forcibly log the user out.
  const origin = req.headers.get("origin");
  const expected = new URL(req.url).origin;
  if (origin && origin !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
