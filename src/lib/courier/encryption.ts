import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Returns a 32-byte key derived from the master encryption secret.
 */
function getDerivedKey(masterSecret?: string): Buffer {
  const secret = masterSecret || process.env.ENCRYPTION_MASTER_KEY || "dokani_default_32_byte_master_encryption_key_2026";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: base64(iv + authTag + cipherText)
 */
export function encryptCredential(plainText: string, masterSecret?: string): string {
  if (!plainText) return "";

  const key = getDerivedKey(masterSecret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine iv (12) + authTag (16) + encrypted
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypts a base64-encoded AES-256-GCM payload.
 */
export function decryptCredential(cipherTextBase64: string, masterSecret?: string): string {
  if (!cipherTextBase64) return "";

  try {
    const combined = Buffer.from(cipherTextBase64, "base64");

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error("Invalid cipher text length");
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const key = getDerivedKey(masterSecret);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.warn("[Encryption] Decryption failed:", err);
    throw new Error("Failed to decrypt sensitive credentials");
  }
}

export interface EncryptedCourierCredentials {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptCourierCredentials(
  creds: Record<string, unknown>,
  masterSecret?: string
): EncryptedCourierCredentials {
  const plainText = JSON.stringify(creds);
  const key = getDerivedKey(masterSecret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptCourierCredentials<T = Record<string, unknown>>(
  encrypted: EncryptedCourierCredentials,
  masterSecret?: string
): T {
  const key = getDerivedKey(masterSecret);
  const iv = Buffer.from(encrypted.iv, "base64");
  const tag = Buffer.from(encrypted.tag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

