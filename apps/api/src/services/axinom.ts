import { createCipheriv, createHmac } from "node:crypto";
export const uuid = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
function communicationKey() {
  const value = process.env.AXINOM_COMMUNICATION_KEY?.trim() ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  const key = Buffer.from(value, "base64");
  return key.length === 32 && key.toString("base64") === value ? key : null;
}
export function axinomCredentialsReady() {
  return uuid(process.env.AXINOM_COMMUNICATION_KEY_ID ?? "") && Boolean(communicationKey());
}
// Axinom inline keys: AES-CBC, no padding, tenant communication key, IV = key ID bytes (big-endian).
export function encryptContentKey(contentKeyId: string, contentKey: Buffer) {
  const key = communicationKey();
  if (!key || !uuid(contentKeyId) || contentKey.length !== 16) throw new Error("Cannot wrap content key");
  const cipher = createCipheriv("aes-256-cbc", key, Buffer.from(contentKeyId.replaceAll("-", ""), "hex")).setAutoPadding(false);
  return Buffer.concat([cipher.update(contentKey), cipher.final()]).toString("base64");
}

export function createAxinomToken(contentKeyId: string, now = Date.now(), encryptedKey = "") {
  const key = communicationKey();
  if (!key || !axinomCredentialsReady() || !uuid(contentKeyId)) throw new Error("Axinom credentials or encoded content key ID are missing or invalid");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    version: 1, com_key_id: process.env.AXINOM_COMMUNICATION_KEY_ID,
    expiration_date: new Date(now + 120000).toISOString(),
    message: { type: "entitlement_message", version: 2, content_keys_source: { inline: [encryptedKey ? { id: contentKeyId, encrypted_key: encryptedKey } : { id: contentKeyId }] } },
  })).toString("base64url");
  const body = `${header}.${payload}`;
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}
