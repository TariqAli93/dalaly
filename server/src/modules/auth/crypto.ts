import crypto from "node:crypto";

const KEY_LENGTH = 64;

export async function hashPin(pin: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(pin, salt);
  return `scrypt:${salt}:${derived}`;
}

export async function verifyPin(pin: string, storedHash: string) {
  const [, salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const derived = await scrypt(pin, salt);
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(derived, "hex"),
  );
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * رمز الوسائط لجلسة: يُشتق من معرّفها وبصمة رمزها المخزنة، فلا يكشف رمز
 * الجلسة نفسه ويبطل معها. يوضع في روابط <img> فقط (الواجهة لا ترسل فيها
 * ترويسة Authorization)، ولا يقبله الخادم إلا لطلبات GET لمسارات الملفات.
 */
export function mediaTokenFor(sessionId: number, tokenHash: string) {
  const signature = crypto
    .createHmac("sha256", tokenHash)
    .update(`media:${sessionId}`)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

export function parseMediaToken(value: string) {
  const match = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(value);
  return match ? { sessionId: Number(match[1]), signature: match[2] } : null;
}

export function sameMediaToken(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function scrypt(pin: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    crypto.scrypt(pin, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey.toString("hex"));
    });
  });
}
