import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ZodError } from "zod";
export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function identify(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw new AppError("Sign in to open your food journal.", 401);
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")) throw new AppError("Please submit from your Site.", 403);
  return user.userId;
}
export function database() {
  if (!env.DB) throw new AppError("Your journal is temporarily unavailable. Please try again.", 503);
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new AppError("Photo storage is temporarily unavailable.", 503);
  return env.BUCKET;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function failure(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message || "Check the entered values." }, 400);
  if (error instanceof SyntaxError) return json({ error: "Invalid request data." }, 400);
  console.error("my-cal request failed", error instanceof Error ? error.name : "unknown");
  return json({ error: "Couldn’t complete that action. Your input is still here; please try again." }, 503);
}
export async function boundedBytes(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new AppError("No data received.");
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new AppError("That file or request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError("JSON is required.", 415);
  return JSON.parse(new TextDecoder().decode(await boundedBytes(request.body, 24_000)));
}
export async function ownedPhoto(key: string | null, userId: string) {
  if (!key) return;
  const found = await database().prepare("SELECT key FROM uploads WHERE key = ? AND user_id = ?").bind(key, userId).first();
  if (!found) throw new AppError("Photo not found in your journal.", 404);
}
