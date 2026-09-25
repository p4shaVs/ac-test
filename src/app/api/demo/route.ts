import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, DEMO_EMAILS } from "@/lib/session";

// force-dynamic: bu route DB'ye bağlanır. Olmadan Next.js build sırasında
// statik render denemek için çağırır → DB yoksa (veya build ortamında
// erişilemezse, ör. Netlify) build "collect page data" adımında ÇÖKER.
export const dynamic = "force-dynamic";

// Tek tıkla demo girişi: demo hesabıyla oturum açar ve panele yönlendirir.
export async function GET(req: NextRequest) {
  const demo = await db.user.findFirst({ where: { email: { in: [...DEMO_EMAILS] } } });
  if (!demo) {
    // Seed yapılmadıysa normal giriş sayfasına gönder.
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // demo: true → the session is read-only (enforced in src/middleware.ts).
  await createSession(demo.id, { demo: true });
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
