import crypto from "node:crypto";
import { DomainError } from "../../shared/errors.js";

/**
 * Password-encrypted backups (the database-only copy the scheduled backup
 * emails): AES-256-GCM with a key derived from the password by scrypt. The
 * file is a header, the encrypted zip, and GCM's 16-byte tag:
 *
 *   "DALALYENC" · version 1 · log2 N, r, p · salt (16) · IV (12) ·
 *   password check (16) · ciphertext · tag (16)
 *
 * The header is authenticated as additional data. The password check is more
 * of scrypt's output, past the key, so a wrong password is told apart from a
 * damaged file; it gives an attacker nothing the tag would not.
 */
export const ENCRYPTED_BACKUP_EXTENSION = ".dalaly-enc";
export const MIN_BACKUP_PASSWORD_LENGTH = 8;

const MAGIC = Buffer.from("DALALYENC", "ascii");
const VERSION = 1;
/** OWASP's scrypt parameters: 128 MiB, about half a second. */
const SCRYPT = { logN: 17, r: 8, p: 1 };
/** Refuse parameters a crafted header could use to exhaust memory. */
const MAX_SCRYPT_MEMORY = 256 * 1024 * 1024;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CHECK_BYTES = 16;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 4 + SALT_BYTES + IV_BYTES + CHECK_BYTES;

type ScryptParams = { logN: number; r: number; p: number };

/** The first bytes of a file are enough to tell. */
export const ENCRYPTED_BACKUP_MAGIC_BYTES = MAGIC.length;
export function isEncryptedBackup(head: Buffer) {
  return (
    head.length >= MAGIC.length && head.subarray(0, MAGIC.length).equals(MAGIC)
  );
}

function scryptMemory({ logN, r }: ScryptParams) {
  return 128 * 2 ** logN * r;
}

/** The key, then the password check. */
function deriveKey(password: string, salt: Buffer, params: ScryptParams) {
  return new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(
      password.normalize("NFC"),
      salt,
      KEY_BYTES + CHECK_BYTES,
      {
        N: 2 ** params.logN,
        r: params.r,
        p: params.p,
        maxmem: 2 * scryptMemory(params),
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function encryptBackup(plain: Buffer, password: string) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const derived = await deriveKey(password, salt, SCRYPT);
  const header = Buffer.concat([
    MAGIC,
    Buffer.from([VERSION, SCRYPT.logN, SCRYPT.r, SCRYPT.p]),
    salt,
    iv,
    derived.subarray(KEY_BYTES),
  ]);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    derived.subarray(0, KEY_BYTES),
    iv,
  );
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

const damaged = () =>
  new DomainError(
    400,
    "ملف النسخة المشفّرة تالف أو ناقص، ولا يمكن فتحه.",
    "BACKUP_DAMAGED",
  );

/**
 * The zip inside an encrypted backup. Every failure is a 400 the restore
 * dialog shows: no password, a wrong one, or a damaged file.
 */
export async function decryptBackup(file: Buffer, password?: string) {
  if (!isEncryptedBackup(file) || file.length < HEADER_BYTES + TAG_BYTES)
    throw damaged();
  let offset = MAGIC.length;
  if (file[offset] !== VERSION)
    throw new DomainError(
      400,
      "هذه النسخة المشفّرة من إصدار أحدث من دلالي. حدّث التطبيق ثم أعد المحاولة.",
      "BACKUP_UNSUPPORTED",
    );
  const params = {
    logN: file[offset + 1],
    r: file[offset + 2],
    p: file[offset + 3],
  };
  if (
    params.logN < 10 ||
    params.r < 1 ||
    params.p < 1 ||
    params.p > 4 ||
    scryptMemory(params) > MAX_SCRYPT_MEMORY
  )
    throw damaged();
  if (!password)
    throw new DomainError(
      400,
      "هذه النسخة مشفّرة. أدخل كلمة مرورها لاسترجاعها.",
      "BACKUP_PASSWORD_REQUIRED",
    );
  offset += 4;
  const salt = file.subarray(offset, (offset += SALT_BYTES));
  const iv = file.subarray(offset, (offset += IV_BYTES));
  const check = file.subarray(offset, (offset += CHECK_BYTES));
  const derived = await deriveKey(password, salt, params);
  if (!crypto.timingSafeEqual(derived.subarray(KEY_BYTES), check))
    throw new DomainError(
      400,
      "كلمة مرور النسخة غير صحيحة.",
      "BACKUP_PASSWORD_INVALID",
    );
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    derived.subarray(0, KEY_BYTES),
    iv,
  );
  decipher.setAAD(file.subarray(0, HEADER_BYTES));
  decipher.setAuthTag(file.subarray(file.length - TAG_BYTES));
  try {
    return Buffer.concat([
      decipher.update(file.subarray(HEADER_BYTES, file.length - TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    throw damaged();
  }
}
