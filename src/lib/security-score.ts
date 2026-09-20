// Sunucu genel bakışta gösterilen "Güvenlik Skoru" (0-100) — müşterinin
// tek bakışta sunucusunun ne kadar korunduğunu görmesi için. 4 bileşen:
//   1) Kural kapsamı     (%35) — kaç güvenlik kuralı açık
//   2) Aksiyon sıkılığı  (%35) — kritik hileler gerçekten BAN'a mı bağlı
//      (müşteri hepsini LOG'a çekip anti-cheat'i "izlemeye" düşürebilir)
//   3) Bağlantı durumu   (%15) — FiveM kaynağı şu an çevrimiçi mi
//   4) Güncellik         (%15) — kaynak sürümü panelin bildiği en güncel mi
import { RULE_GROUPS } from "./rules";
import { DETECTION_TYPES, type DetectionAction } from "./detection-actions";

export const LATEST_AC_VERSION = "0.5.0";

export interface SecurityScoreInput {
  rules: Record<string, boolean>;
  actions: Record<string, DetectionAction>;
  online: boolean;
  acVersion: string | null;
}

export interface SecurityScoreResult {
  score: number; // 0-100
  grade: "critical" | "weak" | "fair" | "good" | "excellent";
  breakdown: { label: string; score: number; max: number; hint: string }[];
}

const ALL_RULE_KEYS = RULE_GROUPS.flatMap((g) => g.rules.map((r) => r.key));
// "Kritik" tespitler — bunlar LOG'a çekilirse gerçek koruma büyük ölçüde biter.
const CRITICAL_TYPES = DETECTION_TYPES.filter((d) => d.defaultAction === "BAN").map((d) => d.type);

export function computeSecurityScore(input: SecurityScoreInput): SecurityScoreResult {
  const enabledRules = ALL_RULE_KEYS.filter((k) => input.rules[k]).length;
  const ruleScore = Math.round((enabledRules / ALL_RULE_KEYS.length) * 35);

  const banConfigured = CRITICAL_TYPES.filter((t) => (input.actions[t] ?? "BAN") === "BAN").length;
  const actionScore = Math.round((banConfigured / CRITICAL_TYPES.length) * 35);

  const onlineScore = input.online ? 15 : 0;
  const upToDate = input.acVersion === LATEST_AC_VERSION;
  const versionScore = input.acVersion ? (upToDate ? 15 : 7) : 0;

  const score = ruleScore + actionScore + onlineScore + versionScore;
  const grade: SecurityScoreResult["grade"] =
    score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : score >= 25 ? "weak" : "critical";

  return {
    score,
    grade,
    breakdown: [
      {
        label: "Rule coverage",
        score: ruleScore,
        max: 35,
        hint: `${enabledRules}/${ALL_RULE_KEYS.length} kural on`,
      },
      {
        label: "Kritik aksiyonlar",
        score: actionScore,
        max: 35,
        hint: `${banConfigured}/${CRITICAL_TYPES.length} critical detections set to Ban`,
      },
      {
        label: "Connection",
        score: onlineScore,
        max: 15,
        hint: input.online ? "Resource online" : "Resource offline",
      },
      {
        label: "Freshness",
        score: versionScore,
        max: 15,
        hint: input.acVersion
          ? upToDate
            ? "Current version"
            : `${input.acVersion} → ${LATEST_AC_VERSION} mevcut`
          : "Version unknown",
      },
    ],
  };
}
