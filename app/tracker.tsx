"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Flame, Plus, Settings2, LockKeyhole, Utensils, Pencil, Trash2, LoaderCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { emptyMeal, localDate, mealSchema, shiftDate, type Meal } from "@/lib/meals";
import Composer from "./composer";
import { api, jsonBody } from "@/lib/client";
import { NativeSelect } from "@/components/ui/native-select";
import { flushSync } from "react-dom";

type Settings = { calorieGoal: number | null; aiReady: boolean };
type Week = { date: string; calories: number; count: number }[];
const fmt = (value: number) => Math.round(value).toLocaleString();
const message = (e: unknown) => e instanceof Error ? e.message : "Something went wrong. Please try again.";

export default function Tracker() {
  const [date, setDate] = useState("");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [week, setWeek] = useState<Week>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Meal | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [remove, setRemove] = useState<Meal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [composerReset, setComposerReset] = useState(0);
  const requestId = useRef(0);

  const reload = useCallback(async (day: string) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await api<{ meals: Meal[]; week: Week }>("/api/meals?date=" + day);
      if (id === requestId.current) { setMeals(data.meals); setWeek(data.week); setError(""); }
    } catch (e) { if (id === requestId.current) { setMeals([]); setWeek([]); setError(message(e)); } }
    finally { if (id === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { setDate(localDate()); }, []);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "stage_manual_meal", title: "Prepare a meal for review",
        description: "Open a manual meal draft in the visible review form. Does not save it; the user reviews and saves.",
        inputSchema: { type: "object", additionalProperties: false, properties: {
          date: { type: "string", description: "Meal date as YYYY-MM-DD." },
          title: { type: "string", description: "Name of the meal." },
          calories: { type: "number", minimum: 0, maximum: 20000 },
          portion: { type: "string" },
          protein: { type: "number", minimum: 0, maximum: 3000 },
          carbs: { type: "number", minimum: 0, maximum: 3000 },
          fat: { type: "number", minimum: 0, maximum: 3000 },
        }, required: ["date", "title", "calories"] },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(raw) {
          if (!raw || typeof raw !== "object") throw new Error("Provide meal details.");
          const data = raw as Record<string, unknown>;
          if (!("date" in data) || !("title" in data) || !("calories" in data)) throw new Error("Date, meal name and calories are required.");
          const meal = mealSchema.parse({ ...emptyMeal(localDate()), ...data, id: crypto.randomUUID(), source: "manual", imageKey: null });
          flushSync(() => { setDraft(meal); setFormError(""); });
          return { staged: true, saved: false, title: meal.title, date: meal.date, calories: meal.calories };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, []);
  useEffect(() => { if (date) void reload(date); }, [date, reload]);
  useEffect(() => { void api<Settings>("/api/settings").then(setSettings).catch(e => setError(message(e))); }, []);
  const totals = meals.reduce((a, m) => ({ calories: a.calories + m.calories, protein: a.protein + (m.protein ?? 0), carbs: a.carbs + (m.carbs ?? 0), fat: a.fat + (m.fat ?? 0) }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const goal = settings?.calorieGoal;
  const progress = goal ? Math.min(totals.calories / goal, 1) : 0;
  const dayTitle = date === localDate() ? "Today" : date ? new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "Your journal";
  function openMeal(meal?: Meal) { setFormError(""); setDraft(meal ? { ...meal } : emptyMeal(date)); }
  async function save(meal: Meal) {
    mealSchema.parse(meal);
    await api("/api/meals", jsonBody(meal));
    if (!meal.createdAt) setComposerReset(n => n + 1);
    setDraft(null); setNotice("Meal saved.");
    if (date !== meal.date) setDate(meal.date); else await reload(meal.date);
  }
  async function saveDraft(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setFormError("");
    try { await save(draft); } catch (e) { setFormError(message(e)); } finally { setBusy(false); }
  }
  async function deleteMeal() {
    if (!remove) return; setBusy(true);
    try {
      await api("/api/meals", { ...jsonBody({ id: remove.id }), method: "DELETE" });
      setRemove(null); setNotice("Meal removed."); await reload(date);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function saveGoal(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFormError("");
    try {
      const data = await api<{ calorieGoal: number | null }>("/api/settings", jsonBody({ calorieGoal: goalInput === "" ? null : Number(goalInput) }));
      setSettings(s => s ? { ...s, ...data } : { ...data, aiReady: false });
      setSettingsOpen(false); setNotice("Daily goal updated.");
    } catch (e) { setFormError(message(e)); } finally { setBusy(false); }
  }
  function scaleDraft(factor: number) {
    if (!draft) return;
    const scaled = { ...draft };
    for (const key of ["calories", "protein", "carbs", "fat"] as const) if (scaled[key] !== null) scaled[key] = Math.round(scaled[key]! * factor * 10) / 10;
    scaled.portion = (factor + " × " + (draft.portion || "original portion")).slice(0, 250);
    setDraft(scaled);
  }
  return <main className="cal-shell">
    <header className="cal-header">
      <a href="/" className="cal-brand"><span className="brand-icon"><Flame size={23} /></span>My Cal<span className="personal-badge">PERSONAL</span></a>
      <div className="header-actions"><span className="privacy-label"><LockKeyhole size={14} /> Only you</span><Button variant="ghost" size="icon" aria-label="Settings" onClick={() => { setGoalInput(goal?.toString() ?? ""); setFormError(""); setSettingsOpen(true); }}><Settings2 /></Button></div>
    </header>
    <div className="journal-heading">
      <div><p className="eyebrow">YOUR FOOD JOURNAL</p><h1>{dayTitle}</h1></div>
      <div className="date-controls">
        <Button variant="outline" size="icon" disabled={!date || loading} aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}><ArrowLeft /></Button>
        <Input type="date" aria-label="Journal date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} />
        <Button variant="outline" size="icon" disabled={!date || loading} aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))}><ArrowRight /></Button>
        {date !== localDate() && <Button variant="ghost" onClick={() => setDate(localDate())}>Today</Button>}
      </div>
    </div>
    <div role="alert" className={error ? "error-banner" : "sr-only"}>{error}{error && <Button variant="ghost" onClick={() => { void reload(date); void api<Settings>("/api/settings").then(setSettings).catch(e => setError(message(e))); }}>Retry</Button>}</div>
    <p className="sr-only" role="status">{notice}</p>
    <section className="nutrition-summary" aria-label="Daily nutrition">
      <div className="calorie-card">
        <div><p className="summary-label">Calories logged</p><div className="calorie-number">{loading || error ? "—" : fmt(totals.calories)}<span>kcal</span></div>
          <p className="summary-foot">{goal ? totals.calories <= goal ? fmt(Math.max(0, goal - totals.calories)) + " left of your " + fmt(goal) + " goal" : fmt(totals.calories - goal) + " above your " + fmt(goal) + " goal" : "No daily goal set"}</p>
          {!goal && <button className="text-link" onClick={() => { setGoalInput(""); setFormError(""); setSettingsOpen(true); }}><Target size={14} /> Set your own goal</button>}
        </div>
        <svg className="calorie-ring" viewBox="0 0 112 112" aria-hidden="true"><circle cx="56" cy="56" r="46" fill="none" stroke="currentColor" opacity=".14" strokeWidth="9"/><circle cx="56" cy="56" r="46" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeDasharray={289} strokeDashoffset={289 * (1 - progress)} transform="rotate(-90 56 56)"/><text x="56" y="62" textAnchor="middle" fill="currentColor" fontSize="19" fontWeight="600">{goal ? Math.round((totals.calories / goal) * 100) + "%" : "kcal"}</text></svg>
      </div>
      <div className="macro-cards">
        {(["protein", "carbs", "fat"] as const).map(key => <div className={"macro-card " + key} key={key}><span className="macro-marker" /><p>{key.charAt(0).toUpperCase() + key.slice(1)}</p><strong>{loading || error ? "—" : fmt(totals[key])}<span> g</span></strong><small>{meals.some(m => m[key] === null) ? "Some meals missing values" : "Logged today"}</small></div>)}
      </div>
    </section>
    <div className="journal-columns">
      <section className="meals-panel">
        <div className="section-heading"><h2>Meals <span>{loading ? "" : meals.length}</span></h2><Button onClick={() => openMeal()} disabled={!date}><Plus /> Add manually</Button></div>
        {loading ? <div className="empty-meals"><LoaderCircle className="animate-spin" aria-label="Loading meals" /></div> : error ? <div className="empty-meals"><p>Your meals couldn’t load. Try again above.</p></div> : meals.length === 0 ? <div className="empty-meals"><span className="empty-icon"><Utensils size={28} /></span><h3>A fresh page for your day.</h3><p>Add your first meal to start tracking.</p><Button variant="outline" onClick={() => openMeal()}><Plus /> Log a meal</Button></div> : <div className="meal-list">{meals.map(meal => <article className="meal-row" key={meal.id}>
          {meal.imageKey ? <img className="meal-photo" src={"/api/photos?key=" + encodeURIComponent(meal.imageKey)} alt={meal.title} loading="lazy" /> : <span className="meal-photo meal-placeholder"><Utensils size={25} /></span>}
          <div className="meal-info"><p className="meal-category">{meal.mealType} · {meal.source === "ai" ? "AI estimate" : "Manual entry"}</p><h3>{meal.title}</h3><p>{meal.portion || "Portion not specified"}</p><p className="meal-macros">P {meal.protein ?? "—"}g · C {meal.carbs ?? "—"}g · F {meal.fat ?? "—"}g</p></div>
          <div className="meal-right"><strong>{fmt(meal.calories)}<small> kcal</small></strong><div><Button variant="ghost" size="icon" aria-label={"Edit " + meal.title} onClick={() => openMeal(meal)}><Pencil size={16}/></Button><Button variant="ghost" size="icon" aria-label={"Remove " + meal.title} onClick={() => setRemove(meal)}><Trash2 size={16}/></Button></div></div>
        </article>)}</div>}
        <section className="week-panel"><div className="section-heading"><h2>Last 7 days</h2><span className="muted">kcal logged</span></div><div className="week-bars">{date && Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6)).map(day => {
          const row = week.find(w => w.date === day); const max = Math.max(...week.map(w => w.calories), 1);
          return <button className={"week-day " + (day === date ? "selected" : "")} key={day} onClick={() => setDate(day)} aria-label={day + ": " + (row ? fmt(row.calories) + " calories" : "no meals logged")}><span>{row ? fmt(row.calories) : "—"}</span><div className="bar-track"><div style={{ height: row ? Math.max(3, row.calories / max * 100) + "%" : "3px" }} /></div><span>{new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}</span></button>;
        })}</div></section>
      </section>
      <Composer date={date} aiReady={settings?.aiReady ?? null} onReview={openMeal} resetKey={composerReset} />
    </div>
    <footer className="cal-footer"><span><LockKeyhole size={13} /> Saved privately to your Site</span><a href="/gallery">Open your image gallery</a></footer>

    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !busy) setDraft(null); }}><DialogContent className="max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>{draft?.createdAt ? "Edit meal" : draft?.source === "ai" ? "Review your estimate" : "Log a meal"}</DialogTitle><DialogDescription>{draft?.source === "ai" ? "Check the portions and numbers before saving. Photo estimates are approximate." : "Enter the calories you know. Macros are optional."}</DialogDescription></DialogHeader>
      {draft && <form className="meal-form" onSubmit={saveDraft}>
        <label>Meal name<Input required maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Chicken and rice" /></label>
        <div className="form-grid"><label>Date<Input required type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })}/></label><label>Meal<NativeSelect value={draft.mealType} onChange={e => setDraft({ ...draft, mealType: e.target.value as Meal["mealType"] })}>{["Breakfast", "Lunch", "Dinner", "Snack"].map(t => <option key={t}>{t}</option>)}</NativeSelect></label></div>
        <label>Portion<Input maxLength={250} value={draft.portion} onChange={e => setDraft({ ...draft, portion: e.target.value })} placeholder="e.g. 150 g chicken, 1 cup cooked rice" /></label>
        <div className="portion-buttons"><span>Scale amounts</span>{[0.5, 1.5, 2].map(factor => <Button key={factor} type="button" variant="outline" size="sm" onClick={() => scaleDraft(factor)}>×{factor}</Button>)}</div>
        <div className="form-grid">{(["calories", "protein", "carbs", "fat"] as const).map(key => <label key={key}>{key === "calories" ? "Calories (kcal)" : key.charAt(0).toUpperCase() + key.slice(1) + " (g)"}<Input type="number" required={key === "calories"} min={0} max={key === "calories" ? 20000 : 3000} step="0.1" value={draft[key] ?? ""} onChange={e => setDraft({ ...draft, [key]: e.target.value === "" && key !== "calories" ? null : Number(e.target.value) })} placeholder="Optional" /></label>)}</div>
        <label>Notes & assumptions<Textarea maxLength={2500} rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Ingredients, cooking oil, or details to remember" /></label>
        {formError && <p role="alert" className="text-destructive">{formError}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? <LoaderCircle className="animate-spin" /> : <Plus />}{busy ? "Saving…" : "Save meal"}</Button>
      </form>}
    </DialogContent></Dialog>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent><DialogHeader><DialogTitle>Your settings</DialogTitle><DialogDescription>Choose a daily goal if you want one.</DialogDescription></DialogHeader><form className="meal-form" onSubmit={saveGoal}><label>Daily calorie goal<Input type="number" min={1} max={20000} step={1} value={goalInput} placeholder="No goal" onChange={e => setGoalInput(e.target.value)}/></label><p className="muted text-sm">Leave empty to track without a target.</p>{formError && <p className="text-destructive" role="alert">{formError}</p>}<Button disabled={busy}>Save settings</Button></form><div className="model-settings"><strong>{settings?.aiReady ? "AI connected" : "AI waiting for your API key"}</strong><p>Photos: GPT-4.1 mini<br/>Text: GPT-4o mini<br/>Voice: GPT-4o mini Transcribe</p><p>Only the meal you submit is sent for analysis. Your journal stays on your private Site.</p><a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer" className="text-link">OpenAI API pricing</a></div></DialogContent></Dialog>
    <AlertDialog open={!!remove} onOpenChange={open => { if (!open && !busy) setRemove(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this meal?</AlertDialogTitle><AlertDialogDescription>{remove?.title} will be removed from your journal and daily totals.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep meal</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void deleteMeal(); }}>{busy ? "Removing…" : "Remove meal"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
