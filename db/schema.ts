import { sqliteTable, text, real, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
export const meals = sqliteTable("meals", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(),
  date: text("date").notNull(), mealType: text("meal_type").notNull(),
  title: text("title").notNull(), portion: text("portion").notNull(),
  calories: real("calories").notNull(), protein: real("protein"), carbs: real("carbs"), fat: real("fat"),
  notes: text("notes").notNull(), source: text("source").notNull(), imageKey: text("image_key"), createdAt: text("created_at").notNull(),
}, (t) => [index("idx_meals_user_date").on(t.userId, t.date)]);
export const settings = sqliteTable("settings", { userId: text("user_id").primaryKey(), calorieGoal: integer("calorie_goal") });
export const uploads = sqliteTable("uploads", {
  key: text("key").primaryKey(), userId: text("user_id").notNull(), contentType: text("content_type").notNull(), name: text("name").notNull(),
});
export const aiUsage = sqliteTable("ai_usage", {
  userId: text("user_id").notNull(), date: text("date").notNull(), calls: integer("calls").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.date] })]);
