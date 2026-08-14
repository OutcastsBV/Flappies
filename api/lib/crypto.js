const crypto = require("crypto");
const { loadEnv } = require("../config/env");

const ALGORITHM = "aes-256-gcm";

function getKey() {
  const env = loadEnv();
  return crypto.createHash("sha256").update(String(env.configEncryptionKey)).digest();
}

/** Encrypt a plaintext string. Returns "iv:authTag:ciphertext" (all base64). */
function encrypt(plaintext) {
  if (plaintext == null || plaintext === "") return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Decrypt a value produced by encrypt(). Returns null on empty/invalid input. */
function decrypt(value) {
  if (!value || typeof value !== "string") return null;

  const parts = value.split(":");
  if (parts.length !== 3) return null;

  try {
    const [ivB64, authTagB64, ciphertextB64] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
