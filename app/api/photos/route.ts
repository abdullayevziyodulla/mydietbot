import { AppError, boundedBytes, bucket, database, failure, identify, json, ownedPhoto } from "@/lib/server";
function imageType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = new TextDecoder().decode(bytes.slice(0, 12));
  if (ascii.startsWith("RIFF") && ascii.endsWith("WEBP")) return "image/webp";
  throw new AppError("Use a JPG, PNG, or WebP photo.", 415);
}
export async function POST(request: Request) {
  try {
    const user = await identify(request);
    const bytes = await boundedBytes(request.body, 4 * 1024 * 1024);
    const contentType = imageType(bytes); const key = "meals/" + crypto.randomUUID();
    const stored = await bucket().put(key, bytes, { httpMetadata: { contentType } });
    if (!stored) throw new AppError("Photo wasn’t saved. Please try again.", 503);
    try { await database().prepare("INSERT INTO uploads (key, user_id, content_type, name) VALUES (?, ?, ?, ?)").bind(key, user, contentType, "Meal photo").run(); }
    catch (e) { await bucket().delete(key); throw e; }
    return json({ key, url: "/api/photos?key=" + encodeURIComponent(key) });
  } catch (e) { return failure(e); }
}
export async function GET(request: Request) {
  try {
    const user = await identify(request); const key = new URL(request.url).searchParams.get("key");
    if (!key) throw new AppError("Photo not found.", 404);
    await ownedPhoto(key, user); const object = await bucket().get(key);
    if (!object) throw new AppError("Photo not found.", 404);
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return failure(e); }
}
