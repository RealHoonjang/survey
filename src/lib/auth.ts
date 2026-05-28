import bcrypt from "bcryptjs";
import { createHash } from "crypto";

export async function hashAdminToken(token: string): Promise<string> {
  return bcrypt.hash(token, 10);
}

export async function verifyAdminToken(
  token: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(token, hash);
}

/** 학번 등 민감 정보 저장용 단방향 해시 (중복 검사용) */
export function hashAuthValue(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
