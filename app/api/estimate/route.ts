import { Buffer } from "node:buffer";
import { z } from "zod";
import { apiKey, MODELS, mealInstructions, estimateJsonSchema, openai, parseEstimate, reserveCall } from "@/lib/ai";
import { AppError, bucket, failure, identify, json, ownedPhoto, readJson } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const user = await identify(request); const key = apiKey();
    const input = z.object({ text: z.string().trim().max(4000), imageKey: z.string().max(250).nullable() }).parse(await readJson(request));
    if (!input.text && !input.imageKey) throw new AppError("Add a photo or describe your meal.");
    await ownedPhoto(input.imageKey, user);
    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: input.text || "Estimate this meal. State the assumed portion." }];
    if (input.imageKey) {
      const object = await bucket().get(input.imageKey);
      if (!object || object.size > 4 * 1024 * 1024) throw new AppError("Photo unavailable. Please attach it again.", 404);
      content.push({ type: "input_image", image_url: "data:" + object.httpMetadata?.contentType + ";base64," + Buffer.from(await object.arrayBuffer()).toString("base64"), detail: "high" });
    }
    await reserveCall(user);
    const raw = await openai("responses", JSON.stringify({
      model: input.imageKey ? MODELS.photo : MODELS.text, store: false, max_output_tokens: 1200,
      instructions: mealInstructions, input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "meal_estimate", strict: true, schema: estimateJsonSchema } },
    }), key);
    return json({ estimate: parseEstimate(raw) });
  } catch (e) { return failure(e); }
}
