import { Buffer } from "node:buffer";
import { z } from "zod";
import { aiProvider, MODELS, ROUTER_MODELS, mealInstructions, estimateJsonSchema, openai, openrouter, parseEstimate, parseRouterEstimate, parseRouterSources, reserveCall } from "@/lib/ai";
import { AppError, bucket, failure, identify, json, ownedPhoto, readJson } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const user = await identify(request); const provider = aiProvider();
    const input = z.object({ text: z.string().trim().max(4000), imageKey: z.string().max(250).nullable(), search: z.boolean().optional() }).parse(await readJson(request));
    if (!input.text && !input.imageKey) throw new AppError("Add a photo or describe your meal.");
    await ownedPhoto(input.imageKey, user);
    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: input.text || "Estimate this meal. State the assumed portion." }];
    if (input.imageKey) {
      const object = await bucket().get(input.imageKey);
      if (!object || object.size > 4 * 1024 * 1024) throw new AppError("Photo unavailable. Please attach it again.", 404);
      content.push({ type: "input_image", image_url: "data:" + object.httpMetadata?.contentType + ";base64," + Buffer.from(await object.arrayBuffer()).toString("base64"), detail: "high" });
    }
    if (provider.kind === "openrouter") {
      const userContent = content.map(part => part.type === "input_image"
        ? { type: "image_url", image_url: { url: part.image_url } }
        : { type: "text", text: part.text });
      async function estimateWithRouter(search: boolean) {
        await reserveCall(user);
        const raw = await openrouter("chat/completions", JSON.stringify({
          model: input.imageKey ? ROUTER_MODELS.photo : ROUTER_MODELS.text,
          messages: [
            { role: "system", content: mealInstructions + (search ? " Search the web for the named item or a comparable dish and typical nutrition. Try local-language spellings when relevant, but do not require the restaurant's own page. Use a sensible single-serving assumption if exact nutrition is unpublished. Clearly distinguish retrieved facts from your estimated calories. Do not stop to ask for ingredients if the dish is identifiable." : "") },
            { role: "user", content: userContent },
          ],
          max_tokens: 1200,
          response_format: { type: "json_schema", json_schema: { name: "meal_estimate", strict: true, schema: estimateJsonSchema } },
          ...(search ? { plugins: [{ id: "web", engine: "parallel", mode: "basic", max_results: 4 }] } : {}),
          provider: { require_parameters: true },
        }), provider.key);
        return { estimate: parseRouterEstimate(raw), sources: search ? parseRouterSources(raw) : [], searched: search };
      }
      const requestedSearch = Boolean(input.search || /\b(search|look\s*up|lookup|google|online)\b/i.test(input.text));
      const first = await estimateWithRouter(requestedSearch);
      if (!requestedSearch && input.text && first.estimate.status === "needs_details") return json(await estimateWithRouter(true));
      return json(first);
    }
    await reserveCall(user);
    const raw = await openai("responses", JSON.stringify({
      model: input.imageKey ? MODELS.photo : MODELS.text, store: false, max_output_tokens: 1200,
      instructions: mealInstructions, input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "meal_estimate", strict: true, schema: estimateJsonSchema } },
    }), provider.key);
    return json({ estimate: parseEstimate(raw) });
  } catch (e) { return failure(e); }
}
