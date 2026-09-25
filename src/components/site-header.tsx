import Link from "next/link";
import { Logo, LinkButton } from "./ui";
import { Icons } from "./icons";
import { getCurrentUser } from "@/lib/session";
import { BRAND } from "@/lib/brand";

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

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Compact menu below lg — plain <details>, no client JS needed. */}
          <details className="group relative lg:hidden">
            <summary
              className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-lg text-slate-300 transition hover:bg-white/5 [&::-webkit-details-marker]:hidden"
              aria-label="Menu"
            >
              <Icons.menu size={20} />
            </summary>
            <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-white/10 bg-base-900 p-2 shadow-card">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
                  {n.label}
                </Link>
              ))}
              <Link href="/purchase" className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
                How to buy
              </Link>
              {!user && (
                <Link href="/login" className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white sm:hidden">
                  Sign in
                </Link>
              )}
            </div>
          </details>
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
                className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-white sm:block"
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
                { href: "/purchase", label: "How to buy" },
                { href: BRAND.discordUrl, label: "Discord" },
              ]}
            />
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 text-xs text-slate-600 sm:flex-row">
          <p>© {new Date().getFullYear()} CoreAC Anti-Cheat. All rights reserved.</p>
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
            {l.href.startsWith("http") ? (
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-500 transition hover:text-slate-200"
              >
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                className="text-sm text-slate-500 transition hover:text-slate-200"
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
