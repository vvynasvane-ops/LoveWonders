// ============================================================
// The whole trust model of the ID code lives here.
//
// A user's "private" data (social links, extra photos) is never stored
// in plain text. It's AES-encrypted with a key derived from that user's
// own ID code before it ever reaches Firestore. Anyone can read the
// ciphertext field — it's meaningless without the code. Sharing the
// code out of band is what actually grants access, not a database rule.
//
// Renewing the code re-encrypts with the new key, which is why renewal
// silently revokes everyone who only knew the old code.
// ============================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(code, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 120000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toB64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function fromB64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }

/** Encrypts a JS object with the given code. Returns a single storable string. */
export async function encryptWithCode(code, dataObj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const plaintext = enc.encode(JSON.stringify(dataObj));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return [toB64(salt), toB64(iv), toB64(new Uint8Array(cipher))].join(".");
}

/** Attempts to decrypt a payload produced by encryptWithCode. Returns null on wrong code. */
export async function decryptWithCode(code, payload) {
  try {
    const [saltB64, ivB64, cipherB64] = payload.split(".");
    const salt = fromB64(saltB64);
    const iv = fromB64(ivB64);
    const cipherBytes = fromB64(cipherB64);
    const key = await deriveKey(code, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
    return JSON.parse(dec.decode(plain));
  } catch (e) {
    return null; // wrong code, or corrupted payload
  }
}

/** Hashes a PIN/password with SHA-256 for local (device-only) verification —
 *  used by the chat-lock feature. Not a secret vault, just enough so the
 *  raw PIN is never sitting in localStorage in plain text. */
export async function hashPin(pin) {
  const bytes = await crypto.subtle.digest("SHA-256", enc.encode(pin));
  return toB64(new Uint8Array(bytes));
}

/** Generates a 9-character code from letters, digits and a safe set of special characters. */
export function generateIdCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%*+?";
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}
