// Session cookie name — kept in its own dependency-free module so the Edge
// middleware can import it without pulling in session.ts (which needs Node's
// crypto and Prisma, neither of which runs on the Edge runtime).
export const SESSION_COOKIE = "coreac_session";
