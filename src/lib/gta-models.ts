// GTA V / FiveM model kataloğu yardımcıları.
// Tam veri (23.9k model) src/data/gta-models.json içindedir ve server tarafında
// /api/gta-models üzerinden sayfalanarak sunulur (client'a gömülmez).

export type ModelKind = "vehicle" | "ped" | "weapon" | "object" | "explosion";

export const KIND_NAMES: ModelKind[] = ["vehicle", "ped", "weapon", "object", "explosion"];

export interface GtaModel {
  name: string;
  label: string;
  kind: ModelKind;
  hash: number;
}

/** FiveM GetHashKey ile aynı: joaat, küçük harfe çevirerek. */
export function joaat(input: string): number {
  const s = input.toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h >>> 0;
}

export const MODEL_KIND_META: Record<ModelKind, { label: string; tab: string }> = {
  vehicle: { label: "Vehicle", tab: "Vehicles" },
  ped: { label: "Ped", tab: "Peds" },
  weapon: { label: "Weapon", tab: "Weapons" },
  object: { label: "Object", tab: "Objects" },
  explosion: { label: "Explosion", tab: "Explosions" },
};
