import { env } from "cloudflare:workers";
import { identify, failure } from "@/lib/server";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("gallery/")) {
    return new Response("Image not found", { status: 404 });
  }

  try {
    await identify(request);
    if (!env.BUCKET) throw new Error("Image storage is unavailable.");
    const object = await env.BUCKET.get(key);
    if (!object) return new Response("Image not found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("ETag", object.httpEtag);
    headers.set("X-Content-Type-Options", "nosniff");
    const fileName = object.customMetadata?.originalName ?? "image";
    headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);

    return new Response(object.body, { headers });
  } catch (error) {
    return failure(error);
  }
}
