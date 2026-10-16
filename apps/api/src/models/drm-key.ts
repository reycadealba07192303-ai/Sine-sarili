import { Schema, model } from "mongoose";

// Content keys for videos SineSarili packages itself. The key is stored only in the form
// Axinom expects (AES-CBC with the tenant communication key), never in the clear.
const drmKeySchema = new Schema(
  {
    keyId: { type: String, required: true, unique: true },
    encryptedKey: { type: String, required: true },
    sourceUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

export const DrmKey = model("DrmKey", drmKeySchema);
