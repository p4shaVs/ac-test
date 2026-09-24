// =============================================================================
// Korumalı FiveM kaynağını (aeigs-anticheat) paketleyip ZIP olarak döndürür.
//
// Installer (CoreAC-Installer.bat) bu ZIP'i panelden indirir, sunucunun
// resources/[coreac]/ klasörüne çıkarır. ZIP içindeki her giriş
// "aeigs-anticheat/..." önekiyle olduğundan, [coreac] altına açılınca doğru
// klasör yapısı oluşur.
// =============================================================================

import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { buildZip, type ZipEntry } from "./zip";

const RESOURCE_ROOT = "aeigs-anticheat";

/** Kaynağın diskteki mutlak yolu. Panel (next start) proje kökünden çalışır. */
function resourceDir(): string {
  return path.join(process.cwd(), "fivem-resource", RESOURCE_ROOT);
}

// Paketlemeye dahil edilmeyecek dosya/klasör adları (geliştirici artıkları).
const SKIP = new Set([".git", ".ds_store", "thumbs.db", "node_modules"]);

async function walk(dir: string, rel: string, out: ZipEntry[]): Promise<void> {
  const items = await readdir(dir);
  for (const item of items) {
    if (SKIP.has(item.toLowerCase())) continue;
    const abs = path.join(dir, item);
    const relPath = rel ? `${rel}/${item}` : item;
    const s = await stat(abs);
    if (s.isDirectory()) {
      await walk(abs, relPath, out);
    } else if (s.isFile()) {
      out.push({ path: `${RESOURCE_ROOT}/${relPath}`, data: await readFile(abs) });
    }
  }
}

/** aeigs-anticheat kaynağını bir ZIP Buffer'ı olarak üretir. */
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
