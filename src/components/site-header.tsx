import Link from "next/link";
import { Logo, LinkButton } from "./ui";
import { getCurrentUser } from "@/lib/session";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#detection", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-base-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <LinkButton
                href={user.role === "ADMIN" ? "/admin" : "/dashboard"}
                variant="secondary"
              >
                Open panel
              </LinkButton>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-white sm:block"
              >
                Sign in
              </Link>
              <LinkButton href="/register" icon="arrowRight">
                Create account
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-base-950">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm text-slate-500">
              Server-authoritative cheat detection for FiveM, with a full
              moderation panel and evidence on every ban.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <FooterCol
              title="Product"
              links={[
                { href: "/#features", label: "Features" },
                { href: "/pricing", label: "Pricing" },
                { href: "/#detection", label: "How it works" },
              ]}
            />
            <FooterCol
              title="Resources"
              links={[
                { href: "/docs", label: "Documentation" },
                { href: "/docs#api", label: "API reference" },
                { href: "/ban", label: "Ban lookup" },
              ]}
            />
            <FooterCol
              title="Account"
              links={[
                { href: "/login", label: "Sign in" },
                { href: "/register", label: "Register" },
                { href: "/dashboard", label: "Panel" },
              ]}
            />
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 text-xs text-slate-600 sm:flex-row">
          <p>© {new Date().getFullYear()} Core Shield Anti-Cheat. All rights reserved.</p>
          <p>FiveM is a trademark of Cfx.re. This project is independent.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h4 className="section-title mb-3">{title}</h4>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              className="text-sm text-slate-500 transition hover:text-slate-200"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
