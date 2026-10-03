import { getCookie, useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

const SESSION_NAME = "prime-mixman-session";
const MIXMAN_PASSWORD = "Choose";
const MIXMAN_SESSION_SECRET =
  "b2f0d1c9e7ab41ff9c2e3d76a5813fa4e60c72d18499bb0511e2f7cc4a9d3e8b";

interface MixmanSession {
  unlocked?: boolean;
}

function cfg() {
  return {
    password: MIXMAN_SESSION_SECRET,
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

export function verifyMixmanPassword(input: string) {
  return tsEq(String(input ?? ""), MIXMAN_PASSWORD);
}

export async function createMixmanSession() {
  return useSession<MixmanSession>(cfg());
}

export async function requireMixmanUnlocked() {
  const s = await createMixmanSession();
  if (!s.data?.unlocked) throw new Error("mixman_locked");
  return s;
}


export async function isMixmanUnlocked() {
  if (!getCookie(SESSION_NAME)) return false;
  try {
    const s = await createMixmanSession();
    return !!s.data?.unlocked;
  } catch {
    return false;
  }
}
