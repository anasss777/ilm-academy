import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const base = process.env.APP_ORIGIN ?? request.nextUrl.origin;
  // 303: the browser follows a POST with a GET
  return NextResponse.redirect(new URL("/", base), { status: 303 });
}
