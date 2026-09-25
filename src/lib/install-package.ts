// =============================================================================
// Korumalı FiveM kaynağını (fivem-resource/coreac) paketleyip ZIP olarak döndürür.
//
// Installer (CoreAC-Installer.bat) bu ZIP'i panelden indirir, geçici bir
// klasöre açar ve içindeki "coreac/" klasörünü sunucunun resources/<klasör>
// yoluna kopyalar (klasör adı kuruluma göre "coreac" ya da gizli bir addır).
// ZIP içindeki her giriş "coreac/..." önekiyle başlar.
// =============================================================================

import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { buildZip, type ZipEntry } from "./zip";

const RESOURCE_ROOT = "coreac";

/** Kaynağın diskteki mutlak yolu. Panel (next start) proje kökünden çalışır. */
function resourceDir(): string {
  return path.join(process.cwd(), "fivem-resource", RESOURCE_ROOT);
}

// Paketlemeye dahil edilmeyecek dosya/klasör adları (geliştirici artıkları).
const SKIP = new Set([".git", ".ds_store", "thumbs.db", "node_modules"]);

// fxmanifest'te YÜKLENMEYEN eski tespit modülleri. Müşteriye gitmeleri bir işe
// yaramaz, yalnızca hile yazarlarına okunacak fazladan kod verir.
const SKIP_PATHS = new Set(["client/detections"]);

async function walk(dir: string, rel: string, out: ZipEntry[]): Promise<void> {
  const items = await readdir(dir);
  for (const item of items) {
    if (SKIP.has(item.toLowerCase())) continue;
    const abs = path.join(dir, item);
    const relPath = rel ? `${rel}/${item}` : item;
    if (SKIP_PATHS.has(relPath)) continue;
    const s = await stat(abs);
    if (s.isDirectory()) {
      await walk(abs, relPath, out);
    } else if (s.isFile()) {
      out.push({ path: `${RESOURCE_ROOT}/${relPath}`, data: await readFile(abs) });
    }
  }
}

/** coreac kaynağını bir ZIP Buffer'ı olarak üretir. */
export async function buildResourceZip(): Promise<Buffer> {
  const root = resourceDir();
  if (!existsSync(root)) {
    throw new Error(`Resource folder not found at ${root}`);
  }
  const entries: ZipEntry[] = [];
  await walk(root, "", entries);
  if (entries.length === 0) {
    throw new Error("Resource folder is empty");
  }
  return buildZip(entries);
}
