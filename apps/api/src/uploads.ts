import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const uploadsDirectory = fileURLToPath(new URL("../uploads/", import.meta.url));

export async function ensureUploadsDirectory() {
  await mkdir(uploadsDirectory, { recursive: true });
}
