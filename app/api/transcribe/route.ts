import { Buffer } from "node:buffer";
import { z } from "zod";
import { aiProvider, MODELS, ROUTER_MODELS, openai, openrouter, reserveCall } from "@/lib/ai";
import { AppError, boundedBytes, failure, identify, json } from "@/lib/server";
const audioTypes: Record<string, string> = { "audio/webm": "webm", "video/webm": "webm", "audio/mp4": "m4a", "video/mp4": "mp4", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" };
export async function POST(request: Request) {
  try {
    const user = await identify(request); const provider = aiProvider();
    const type = request.headers.get("content-type")?.split(";")[0] || "";
    const extension = audioTypes[type]; if (!extension) throw new AppError("Choose an MP3, M4A, MP4, WAV, or WebM voice note.", 415);
    const bytes = await boundedBytes(request.body, 10 * 1024 * 1024);
    if (!bytes.length) throw new AppError("The recording is empty. Please try again.");
    await reserveCall(user);
    if (provider.kind === "openrouter") {
      const data = z.object({ text: z.string().trim().min(1).max(4000) }).safeParse(await openrouter("audio/transcriptions", JSON.stringify({
        model: ROUTER_MODELS.audio,
        input_audio: { data: Buffer.from(bytes).toString("base64"), format: extension },
      }), provider.key));
      if (!data.success) throw new AppError("Couldn’t hear a short meal description. Try recording again.", 422);
      return json({ text: data.data.text });
    }
    const body = new FormData();
    body.set("model", MODELS.audio); body.set("response_format", "json");
    body.set("prompt", "A description of food eaten, ingredients, portions, weights and cooking methods. Transcribe faithfully in the original language.");
    body.set("file", new File([bytes], "meal." + extension, { type }));
    const data = z.object({ text: z.string().trim().min(1).max(4000) }).safeParse(await openai("audio/transcriptions", body, provider.key));
    if (!data.success) throw new AppError("Couldn’t hear a short meal description. Try recording again.", 422);
    return json({ text: data.data.text });
  } catch (e) { return failure(e); }
}
