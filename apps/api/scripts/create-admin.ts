import { connectDatabase } from "../src/db.js";
import { createPasswordHash } from "../src/auth.js";
import { AdminUser } from "../src/models/admin-user.js";

const name = process.env.ADMIN_NAME?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!name || !email || !password || password.length < 14) {
  throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 14 characters) before creating an admin.");
}

await connectDatabase();
await AdminUser.updateOne(
  { email },
  { $set: { name, passwordHash: createPasswordHash(password), role: "admin", status: "active" }, $setOnInsert: { email } },
  { upsert: true },
);
console.log(`Admin account is ready for ${email}.`);
await AdminUser.db.close();
