import { test } from "node:test";
import assert from "node:assert/strict";
import { readReceipt, isReceiptReaderConfigured, ReceiptReadingSchema } from "../src/services/receipt-reader.js";

test("OpenRouter validates structured image responses and fails closed", async t => {
  const previous = { key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL };
  t.after(() => {
    if (previous.key === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous.key;
    if (previous.model === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL = previous.model;
  });
  process.env.OPENROUTER_API_KEY = "test-only";
  process.env.OPENROUTER_MODEL = "test/vision-model";
  const reading = { is_payment_receipt: true, transaction_status: "successful", provider: "GCash", amount: 199, currency: "PHP", reference_number: "REF12345", recipient_name: "Cinema", recipient_account: "09123456789", transaction_datetime: null, looks_edited: false, observations: "Clear receipt" };
  assert.ok(ReceiptReadingSchema.safeParse(reading).success);
  let status = 200, content = JSON.stringify(reading), finish = "stop", timeout = false;
  t.mock.method(globalThis, "fetch", async (url: string, options: any) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer test-only");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "test/vision-model");
    assert.equal(body.response_format.type, "json_schema");
    assert.match(body.messages[1].content[0].image_url.url, /^data:image\/png;base64,/);
    assert.equal(body.provider.data_collection, "deny");
    if (timeout) throw new Error("timeout");
    return new Response(JSON.stringify({choices:[{finish_reason:finish,message:{content}}]}), {status});
  });
  const image = {data:Buffer.from("mock image"),mediaType:"image/png" as const};
  assert.deepEqual(await readReceipt(image), {ok:true,reading});
  content = '{"amount":199}';
  assert.equal((await readReceipt(image)).ok, false);
  content = "not json";
  assert.equal((await readReceipt(image)).ok, false);
  finish = "length";
  assert.equal((await readReceipt(image)).ok, false);
  status = 429;
  assert.equal((await readReceipt(image)).ok, false);
  status = 401;
  assert.equal((await readReceipt(image)).ok, false);
  timeout = true;
  assert.equal((await readReceipt(image)).ok, false);
  delete process.env.OPENROUTER_MODEL;
  assert.equal(isReceiptReaderConfigured(), false);
  assert.equal((await readReceipt(image)).ok, false);
});
