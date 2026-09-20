import Link from "next/link";
import { Logo, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <p className="text-7xl font-extrabold text-white">404</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-200">Page not found</h1>
        <p className="mt-2 text-slate-500">
          That page may have moved, or never existed.
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <LinkButton href="/">Home</LinkButton>
          <Link
            href="/dashboard"
            className="btn-secondary"
          >
            Open panel
          </Link>
        </div>
      </div>
    </div>
  );
}
