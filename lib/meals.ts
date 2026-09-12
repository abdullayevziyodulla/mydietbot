import { z } from "zod";
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}, "Choose a valid date.");
const macro = z.number().finite().min(0).max(3000).nullable();
export const mealSchema = z.object({
  id: z.string().uuid(), date: dateSchema, mealType: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  title: z.string().trim().min(1, "Add a meal name.").max(160), portion: z.string().trim().max(250),
  calories: z.number().finite().min(0).max(20000), protein: macro, carbs: macro, fat: macro,
  notes: z.string().max(2500), source: z.enum(["manual", "ai"]), imageKey: z.string().max(250).nullable(),
});
export type Meal = z.infer<typeof mealSchema> & { createdAt?: string; searched?: boolean; searchSources?: { url: string; title: string }[] };
export function localDate(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + days); return localDate(d);
}
export function currentStreak(loggedDays: string[], today: string) {
  const days = new Set(loggedDays);
  let day = days.has(today) ? today : shiftDate(today, -1);
  let count = 0;
  while (days.has(day)) { count++; day = shiftDate(day, -1); }
  return count;
}
export function emptyMeal(date: string): Meal {
  const h = new Date().getHours();
  return { id: crypto.randomUUID(), date, mealType: h < 11 ? "Breakfast" : h < 16 ? "Lunch" : "Dinner", title: "", portion: "", calories: 0, protein: null, carbs: null, fat: null, notes: "", source: "manual", imageKey: null };
}
