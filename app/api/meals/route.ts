import { dateSchema, mealSchema, shiftDate } from "@/lib/meals";
import { AppError, database, failure, identify, json, ownedPhoto, readJson } from "@/lib/server";
export async function GET(request: Request) {
  try {
    const user = await identify(request);
    const date = dateSchema.parse(new URL(request.url).searchParams.get("date")); const db = database();
    const [meals, week] = await db.batch([
      db.prepare("SELECT id, date, meal_type AS mealType, title, portion, calories, protein, carbs, fat, notes, source, image_key AS imageKey, created_at AS createdAt FROM meals WHERE user_id = ? AND date = ? ORDER BY created_at DESC").bind(user, date),
      db.prepare("SELECT date, SUM(calories) AS calories, COUNT(*) AS count FROM meals WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date").bind(user, shiftDate(date, -6), date),
    ]);
    return json({ meals: meals.results, week: week.results });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const user = await identify(request); const meal = mealSchema.parse(await readJson(request)); await ownedPhoto(meal.imageKey, user);
    const saved = await database().prepare(`INSERT INTO meals (id, user_id, date, meal_type, title, portion, calories, protein, carbs, fat, notes, source, image_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET date=excluded.date, meal_type=excluded.meal_type, title=excluded.title, portion=excluded.portion, calories=excluded.calories, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat, notes=excluded.notes, source=excluded.source, image_key=excluded.image_key WHERE meals.user_id=excluded.user_id RETURNING id`)
      .bind(meal.id, user, meal.date, meal.mealType, meal.title, meal.portion, meal.calories, meal.protein, meal.carbs, meal.fat, meal.notes, meal.source, meal.imageKey, new Date().toISOString()).first();
    if (!saved) throw new AppError("That meal couldn’t be updated.", 403);
    return json({ saved: true, id: meal.id });
  } catch (e) { return failure(e); }
}
export async function DELETE(request: Request) {
  try {
    const user = await identify(request); const { id } = mealSchema.pick({ id: true }).parse(await readJson(request));
    await database().prepare("DELETE FROM meals WHERE id = ? AND user_id = ?").bind(id, user).run();
    return json({ deleted: true });
  } catch (e) { return failure(e); }
}
