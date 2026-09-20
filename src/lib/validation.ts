import { z } from "zod";
import { FEATURE_KEYS } from "./features";

// Tüm giriş noktalarında kullanılan Zod şemaları.

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(24, "Username must be at most 24 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const loginSchema = z.object({
  emailOrUsername: z.string().trim().min(1, "This field is required"),
  password: z.string().min(1, "Password is required"),
});

export const createServerSchema = z.object({
  name: z.string().trim().min(2).max(48),
  ip: z.string().trim().max(64).optional(),
  licenseKeyId: z.string().min(1, "Licence key is required"),
});

// FeloxAC tarzı tek-adım: key + ip + port + ad ile aktifleştir & oluştur.
export const activateServerSchema = z.object({
  key: z.string().trim().toUpperCase(),
  name: z.string().trim().min(2).max(48),
  ip: z.string().trim().max(64).optional(),
  port: z.number().int().min(1).max(65535).default(30120),
});

export const redeemSchema = z.object({
  key: z.string().trim().toUpperCase(),
});

export const banActionSchema = z.object({
  playerId: z.string().min(1),
  reason: z.string().trim().min(2).max(256),
  permanent: z.boolean().default(true),
  durationHours: z.number().int().positive().max(8760).optional(),
});

export const punishSchema = z.object({
  playerId: z.string().min(1),
  type: z.enum(["WARN", "KICK", "BAN"]),
  reason: z.string().trim().min(2).max(256),
  durationHours: z.number().int().positive().max(8760).optional(),
});

// --- Admin ---

export const createProductSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().min(2).max(500),
  priceCents: z.number().int().min(0).max(1_000_000),
  currency: z.string().trim().length(3).default("EUR"),
  interval: z.enum(["MONTHLY", "YEARLY", "LIFETIME"]).default("MONTHLY"),
  features: z.array(z.enum(FEATURE_KEYS as [string, ...string[]])).default([]),
  active: z.boolean().default(true),
});

export const generateKeySchema = z.object({
  productId: z.string().optional(),
  ownerEmail: z.string().trim().toLowerCase().email().optional(),
  features: z.array(z.enum(FEATURE_KEYS as [string, ...string[]])).default([]),
  maxServers: z.number().int().min(1).max(50).default(1),
  quantity: z.number().int().min(1).max(100).default(1),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  note: z.string().trim().max(200).optional(),
});

export const updateKeySchema = z.object({
  status: z.enum(["UNUSED", "ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"]).optional(),
  features: z.array(z.enum(FEATURE_KEYS as [string, ...string[]])).optional(),
  note: z.string().trim().max(200).optional(),
});
