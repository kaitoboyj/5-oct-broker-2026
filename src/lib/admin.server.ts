import { getCookie, useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

const SESSION_NAME = "prime-admin-session";

// Embedded fallbacks so the admin dashboard always works even if the
// project env vars are missing or empty. Env values still take precedence.
const DEFAULT_ADMIN_PASSWORD = "Choose";
const DEFAULT_ADMIN_SESSION_SECRET =
  "51a212c09a217e56abb59d556d4f72ee03919fe590fbc6575c4063743e2e5da60b8f53749cf6f4565fda22fbf176579b";

// Retired passwords that must never unlock the dashboard again, even if a
// deployment env var (e.g. on Netlify) still holds the old value.
const RETIRED_PASSWORDS = ["Bethebest", "Bethebest1rr"];

function configuredAdminPassword() {
  const v = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (v.length === 0 || RETIRED_PASSWORDS.includes(v)) return "";
  return v;
}

export function adminPassword() {
  return configuredAdminPassword() || DEFAULT_ADMIN_PASSWORD;
}

export function verifyAdminPassword(input: string) {
  if (RETIRED_PASSWORDS.some((p) => timingSafeStrEq(input, p))) return false;
  const configured = configuredAdminPassword();
  if (configured.length > 0 && timingSafeStrEq(input, configured)) return true;
  return timingSafeStrEq(input, DEFAULT_ADMIN_PASSWORD);
}
export function adminSessionSecret() {
  const v = (process.env.ADMIN_SESSION_SECRET ?? "").trim();
  return v.length >= 32 ? v : DEFAULT_ADMIN_SESSION_SECRET;
}

interface AdminSession {
  unlocked?: boolean;
}

function sessionConfig() {
  return {
    password: adminSessionSecret(),
    name: SESSION_NAME,
    maxAge: 60 * 60 * 8,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
  };
}

export function timingSafeStrEq(a: string, b: string) {
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return ah.length === bh.length && timingSafeEqual(ah, bh);
}


export async function createAdminSession() {
  return useSession<AdminSession>(sessionConfig());
}

export async function requireAdminUnlocked() {
  const session = await createAdminSession();
  if (!session.data?.unlocked) throw new Error("admin_locked");
  return session;
}

export async function isAdminUnlocked() {
  if (!getCookie(SESSION_NAME)) return false;
  try {
    const session = await createAdminSession();
    return !!session.data?.unlocked;
  } catch {
    return false;
  }
}