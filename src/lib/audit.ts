import { db } from "./db";

// Güvenlik denetim kaydı — hassas işlemleri (giriş, key üretimi, ban vb.) izler.
export async function audit(params: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        ip: params.ip ?? null,
        meta: JSON.stringify(params.meta ?? {}),
      },
    });
  } catch (err) {
    // Denetim kaydı ana akışı bloklamamalı.
    console.error("[AUDIT_FAIL]", err);
  }
}
