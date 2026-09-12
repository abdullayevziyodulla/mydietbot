import { Buffer } from "node:buffer";
import { z } from "zod";
import { aiProvider, MODELS, ROUTER_MODELS, mealInstructions, estimateJsonSchema, openai, openrouter, parseEstimate, parseRouterEstimate, reserveCall } from "@/lib/ai";
import { AppError, bucket, failure, identify, json, ownedPhoto, readJson } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const user = await identify(request); const provider = aiProvider();
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
    if (provider.kind === "openrouter") {
      const messages = [{ role: "system", content: mealInstructions }, { role: "user", content: content.map(part => part.type === "input_image"
        ? { type: "image_url", image_url: { url: part.image_url } }
        : { type: "text", text: part.text }) }];
      const raw = await openrouter("chat/completions", JSON.stringify({
        model: input.imageKey ? ROUTER_MODELS.photo : ROUTER_MODELS.text,
        messages, max_tokens: 1200,
        response_format: { type: "json_schema", json_schema: { name: "meal_estimate", strict: true, schema: estimateJsonSchema } },
        provider: { require_parameters: true },
      }), provider.key);
      return json({ estimate: parseRouterEstimate(raw) });
    }
    const raw = await openai("responses", JSON.stringify({
      model: input.imageKey ? MODELS.photo : MODELS.text, store: false, max_output_tokens: 1200,
      instructions: mealInstructions, input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "meal_estimate", strict: true, schema: estimateJsonSchema } },
    }), provider.key);
    return json({ estimate: parseEstimate(raw) });
  } catch (e) { return failure(e); }
}
