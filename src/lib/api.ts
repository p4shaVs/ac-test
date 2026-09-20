import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser, type CurrentUser } from "./session";

// Standart API yanıt yardımcıları ve hata yönetimi.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(status: number, message: string, code?: string) {
  return NextResponse.json(
    { ok: false, error: message, code },
    { status }
  );
}

/** Route handler'ları sarar; ApiError ve ZodError'ı düzgün yanıta çevirir. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, err.message, err.code);
      }
      if (err instanceof ZodError) {
        return fail(422, "Invalid data", "VALIDATION_ERROR");
      }
      console.error("[API_ERROR]", err);
      return fail(500, "Server error");
    }
  };
}

/** Giriş yapmış kullanıcı gerektirir. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "You must be signed in", "UNAUTHORIZED");
  return user;
}

/** ADMIN rolü gerektirir. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new ApiError(403, "You do not have permission to do this", "FORBIDDEN");
  }
  return user;
}
