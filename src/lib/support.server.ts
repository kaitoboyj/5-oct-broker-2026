import { getCookie, useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

const SESSION_NAME = "prime-support-session";
const SUPPORT_PASSWORD = "Choose";
const SUPPORT_SESSION_SECRET =
  "6e9b1d4a72c8f035ab5e1c7d92f4068b3ad57e21cc80fb9647d3e5a1b8027fc5";

interface SupportSession {
  unlocked?: boolean;
}

function cfg() {
  return {
    password: SUPPORT_SESSION_SECRET,
    name: SESSION_NAME,
    maxAge: 60 * 60 * 12,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
  };
}

function tsEq(a: string, b: string) {
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return ah.length === bh.length && timingSafeEqual(ah, bh);
}

export function verifySupportPassword(input: string) {
  return tsEq(String(input ?? ""), SUPPORT_PASSWORD);
}

export async function createSupportSession() {
  return useSession<SupportSession>(cfg());
}

export async function isSupportUnlocked() {
  if (!getCookie(SESSION_NAME)) return false;
  try {
    const s = await createSupportSession();
    return !!s.data?.unlocked;
  } catch {
    return false;
  }
}

/** The support inbox is reachable with the support, admin or Mix Man session. */
export async function requireSupportStaff() {
  if (await isSupportUnlocked()) return true;
  const { isAdminUnlocked } = await import("./admin.server");
  if (await isAdminUnlocked()) return true;
  const { isMixmanUnlocked } = await import("./mixman.server");
  if (await isMixmanUnlocked()) return true;
  throw new Error("support_locked");
}
