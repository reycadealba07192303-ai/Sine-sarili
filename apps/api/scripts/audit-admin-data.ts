import mongoose from "mongoose";
import { connectDatabase } from "../src/db.js";
await connectDatabase();
const db = mongoose.connection.db!;
for (const name of ["films", "subscriptions", "bankaccounts", "adminusers"]) {
 const collection = db.collection(name);
 const records = await collection.find({}, { projection: { title:1,slug:1,videoUrl:1,viewerEmail:1,transactionReference:1,email:1,accountNumber:1,notes:1,role:1 } }).limit(230).toArray();
 console.log(JSON.stringify({collection:name, records}));
}
await mongoose.disconnect();
