import raw from "@/data/gta-models.json";
import { KIND_NAMES, type GtaModel, type ModelKind } from "./gta-models";

// data/gta-models.json: { counts, rows: [name, label, kindIndex, hash][] }
type Row = [string, string, number, number];
const DATA = raw as unknown as { counts: Record<string, number>; rows: Row[] };

export const MODEL_COUNTS: Record<string, number> = DATA.counts;

function toModel(r: Row): GtaModel {
  return { name: r[0], label: r[1], kind: KIND_NAMES[r[2]], hash: r[3] };
}

let byHash: Map<number, string> | null = null;

/**
 * Catalog name for a stored blacklist model. The picker saves the numeric
 * (unsigned) hash, so a row's `model` is usually "3078201489" rather than
 * "adder"; this maps it back so the page can show the row as listed.
 */
export function modelNameForHash(model: string): string {
  if (!/^-?d+$/.test(model)) return model.toLowerCase();
  if (!byHash) {
    byHash = new Map();
    for (const r of DATA.rows) byHash.set(r[3] >>> 0, r[0]);
  }
  return byHash.get(Number(model) >>> 0) ?? model;
}

export interface SearchResult {
  items: GtaModel[];
  total: number;
  counts: Record<string, number>;
}

/** Kind + arama sorgusuna göre sayfalanmış model araması (server tarafı). */
export function searchModels(opts: {
  kind?: ModelKind | "all";
  q?: string;
  offset?: number;
  limit?: number;
}): SearchResult {
  const kind = opts.kind ?? "all";
  const q = (opts.q ?? "").trim().toLowerCase();
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(120, Math.max(1, opts.limit ?? 60));
  const kindIdx = kind === "all" ? -1 : KIND_NAMES.indexOf(kind);

  const items: GtaModel[] = [];
  let total = 0;
  for (const r of DATA.rows) {
    if (kindIdx >= 0 && r[2] !== kindIdx) continue;
    if (q && !(r[0].includes(q) || r[1].toLowerCase().includes(q) || String(r[3]).includes(q))) continue;
    if (total >= offset && items.length < limit) items.push(toModel(r));
    total++;
  }
  return { items, total, counts: DATA.counts };
}
