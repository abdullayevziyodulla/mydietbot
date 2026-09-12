import { z } from "zod";
import { env } from "cloudflare:workers";
import { database, failure, identify, json, readJson } from "@/lib/server";
export async function GET(request: Request) {
  try {
    const user = await identify(request);
    const settings = await database().prepare("SELECT calorie_goal AS calorieGoal FROM settings WHERE user_id = ?").bind(user).first();
    const provider = env.OPENROUTER_API_KEY?.trim() ? "OpenRouter" : env.OPENAI_API_KEY?.trim() ? "OpenAI" : null;
    return json({ calorieGoal: settings?.calorieGoal ?? null, aiReady: Boolean(provider), provider });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const user = await identify(request);
    const { calorieGoal } = z.object({ calorieGoal: z.number().int().min(1).max(20000).nullable() }).parse(await readJson(request));
    await database().prepare("INSERT INTO settings (user_id, calorie_goal) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET calorie_goal=excluded.calorie_goal").bind(user, calorieGoal).run();
    return json({ calorieGoal });
  } catch (e) { return failure(e); }
}
