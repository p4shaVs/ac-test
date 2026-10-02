import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/jwt";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// Edge middleware: /dashboard ve /admin için kaba erişim kontrolü + demo
// oturumunun salt-okunur tutulması. DB doğrulaması route/sayfa seviyesinde
// (getCurrentUser) yeniden yapılır.

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// A demo visitor must still be able to leave.
const DEMO_ALLOWED_WRITES = new Set(["/api/auth/logout"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySession(token) : null;

  // ---------------------------------------------------------------------
  // PUBLIC DEMO = READ-ONLY.
  // /api/demo signs anyone on the internet into a shared account. Without
  // this guard every visitor could delete the demo servers, regenerate their
  // tokens, ban/unban, change the password and lock the next visitor out.
  // The flag lives in the signed session JWT, so it cannot be stripped.
  // Server-to-server calls (/api/v1/*) use a Bearer token, never this cookie.
  // ---------------------------------------------------------------------
  if (claims?.demo && pathname.startsWith("/api/") && MUTATING.has(req.method)) {
    if (!DEMO_ALLOWED_WRITES.has(pathname)) {
      return NextResponse.json(
        { ok: false, error: "The demo panel is read-only. Create an account to make changes.", code: "DEMO_READ_ONLY" },
        { status: 403 }
      );
    }
  }

  const isDashboard = pathname.startsWith("/dashboard");
  const isAdmin = pathname.startsWith("/admin");

  // Giriş yapmamışsa korumalı alanları engelle (kaba kontrol; DB doğrulaması
  // sayfa/layout seviyesinde tekrar yapılır).
  if ((isDashboard || isAdmin) && !claims) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Admin alanı yalnızca ADMIN (JWT rolüne göre kaba kontrol).
  if (isAdmin && claims?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // NOT: Giriş sayfalarında "zaten girişli → panele at" yönlendirmesi
  // BİLEREK middleware'de YAPILMAZ. Aksi halde DB oturumu silinmiş ama JWT
  // çerezi hâlâ duran bir kullanıcıda /login ⇄ /panel sonsuz döngüsü oluşur.
  // Bu kontrol login/register sayfalarında DB doğrulamasıyla yapılır.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/:path*"],
};
