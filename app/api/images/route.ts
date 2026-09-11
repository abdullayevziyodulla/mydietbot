import { env } from "cloudflare:workers";
import { identify, boundedBytes, failure } from "@/lib/server";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function displayNameFromKey(key: string): string {
  const encoded = key.split("--").at(-1);
  if (!encoded) return "Image";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "Image";
  }
}

function getBucket(): R2Bucket {
  if (!env.BUCKET) throw new Error("Image storage is unavailable.");
  return env.BUCKET;
}

export async function GET(request: Request) {
  try {
    await identify(request);
    const result = await getBucket().list({
      prefix: "gallery/",
      limit: 1000,
    });

    const images = result.objects
      .map((object) => ({
        key: object.key,
        name: displayNameFromKey(object.key),
        size: object.size,
        uploaded: object.uploaded.toISOString(),
        url: `/api/image?key=${encodeURIComponent(object.key)}`,
      }))
      .sort((left, right) => right.uploaded.localeCompare(left.uploaded));

    return Response.json(
      { images },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_IMAGE_BYTES + 1024 * 1024) {
    return Response.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
  }

  try {
    await identify(request);
    const bytes = await boundedBytes(request.body, MAX_IMAGE_BYTES + 1024 * 1024);
    const formData = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    const image = formData.get("image");
    if (!(image instanceof File) || !ALLOWED_IMAGE_TYPES.has(image.type)) {
      return Response.json({ error: "Choose a JPG, PNG, WebP, GIF, or AVIF image." }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: "Images must be 10 MB or smaller." }, { status: 413 });
    }

    const encodedName = encodeURIComponent(image.name.slice(0, 180));
    const key = `gallery/${Date.now()}-${crypto.randomUUID()}--${encodedName}`;
    const stored = await getBucket().put(key, image.stream(), {
      httpMetadata: { contentType: image.type },
      customMetadata: {
        originalName: image.name.slice(0, 240),
        contentType: image.type,
      },
    });

    if (!stored) {
      return Response.json({ error: "The image wasn’t saved. Try again." }, { status: 500 });
    }

    return Response.json({
      image: {
        key,
        name: image.name,
        size: image.size,
        uploaded: stored.uploaded.toISOString(),
        url: `/api/image?key=${encodeURIComponent(key)}`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
