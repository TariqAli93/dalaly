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
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
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
