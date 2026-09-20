import Link from "next/link";
import { Logo } from "@/components/ui";
import { Icons } from "@/components/icons";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Sol taraf — marka / tanıtım */}
      <div className="relative hidden overflow-hidden border-r border-white/5 bg-base-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-10 h-60 w-60 rounded-full bg-accent-violet/10 blur-3xl" />

        <Link href="/" className="relative">
          <Logo size="lg" />
        </Link>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-bold leading-tight text-white">
            Sunucunuzu hilecilerden koruyan{" "}
            <span className="bg-gradient-to-r from-brand-400 to-accent-violet bg-clip-text text-transparent">
              server-side protection
            </span>
          </h2>
          <ul className="mt-8 space-y-4">
            {[
              "Real-time aimbot and exploit detection",
              "Full player management from the web panel",
              "Encrypted licence and HWID protection",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-slate-300">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
                  <Icons.check size={14} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-600">
          © {new Date().getFullYear()} Core Shield Anti-Cheat
        </p>
      </div>

      {/* Sağ taraf — form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/">
              <Logo />
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
