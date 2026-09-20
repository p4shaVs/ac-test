import { NextRequest } from "next/server";
import { handler, ok, requireUser } from "@/lib/api";
import { searchModels } from "@/lib/model-catalog";
import { KIND_NAMES, type ModelKind } from "@/lib/gta-models";

export const dynamic = "force-dynamic";

// Model Arama kataloğu — kind + arama ile sayfalanmış sonuç döndürür.
export const GET = handler(async (req: NextRequest) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  const kindParam = sp.get("kind") ?? "all";
  const kind = (KIND_NAMES.includes(kindParam as ModelKind) ? kindParam : "all") as ModelKind | "all";
  const q = sp.get("q") ?? "";
  const offset = Number(sp.get("offset") ?? 0) || 0;
  const limit = Number(sp.get("limit") ?? 60) || 60;

  const res = searchModels({ kind, q, offset, limit });
  return ok(res);
});
