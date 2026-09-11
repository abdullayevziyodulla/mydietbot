"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Flame, Plus, Settings2, LockKeyhole, Utensils, Pencil, Trash2, LoaderCircle, Target, Apple, House, ChartNoAxesColumn, Beef, Wheat, Droplet, CalendarDays } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [view, setView] = useState("home");
  const [addOpen, setAddOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
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
  function openMeal(meal?: Meal) { setAddOpen(false); setFormError(""); setDraft(meal ? { ...meal } : emptyMeal(date)); }
  async function save(meal: Meal) {
    mealSchema.parse(meal);
    await api("/api/meals", jsonBody(meal));
    if (!meal.createdAt) setComposerReset(n => n + 1);
    setDraft(null); setView("home"); setNotice("Meal saved.");
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
  const macroEnergy = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
  const calendarStart = date ? shiftDate(date, -new Date(date + "T12:00:00").getDay()) : "";
  const unavailable = loading || Boolean(error);
  return <main className="cal-shell">
    <header className="cal-header">
      <h1 className="cal-brand"><Apple size={29} fill="currentColor" strokeWidth={1.7} />My Cal</h1>
      <span className="meal-count-badge" title="Meals logged on this day"><Flame size={17} fill="#ffb05c" stroke="#e77826" /><span>{unavailable ? "—" : meals.length}</span><span className="sr-only"> meals logged</span></span>
    </header>
    <div className="month-row"><button onClick={() => setCalendarOpen(true)} className="calendar-link"><span>{date ? new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Your journal"}</span><CalendarDays size={14}/></button><span className="privacy-label"><LockKeyhole size={12}/> Only you</span></div>
    <div className="calendar-strip" aria-label="Choose a day">
      {calendarStart && Array.from({ length: 7 }, (_, i) => shiftDate(calendarStart, i)).map(day => <button key={day} aria-pressed={day === date} aria-label={new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} className={"calendar-day " + (day === date ? "selected" : "") + (day === localDate() ? " is-today" : "")} onClick={() => setDate(day)}><span>{new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1)}</span><small>{new Date(day + "T12:00:00").getDate()}</small></button>)}
    </div>
    {error && <div role="alert" className="error-banner">{error}<Button variant="ghost" onClick={() => { void reload(date); void api<Settings>("/api/settings").then(setSettings).catch(e => setError(message(e))); }}>Retry</Button></div>}
    <p className="sr-only" role="status">{notice}</p>
    <Tabs value={view} onValueChange={setView} className="journal-tabs">
      <TabsContent value="home">
        <section className="nutrition-summary" aria-label={dayTitle + " nutrition"}>
          <div className="calorie-card">
            <div><div className="calorie-number">{unavailable ? "—" : fmt(goal ? Math.max(0, goal - totals.calories) : totals.calories)}</div><p className="summary-label">{goal ? "Calories left" : "Calories logged"}</p>
              {goal && totals.calories > goal && !unavailable && <p className="summary-foot">{fmt(totals.calories - goal)} over your goal</p>}
              {!goal && <button className="goal-link" onClick={() => { setGoalInput(""); setFormError(""); setSettingsOpen(true); }}>Set daily goal</button>}
            </div>
            <NutritionRing progress={unavailable ? 0 : progress} className="calorie-ring"><Flame size={23} fill="currentColor" /></NutritionRing>
          </div>
          <div className="macro-cards">
            {([{ key: "protein", label: "Protein", Icon: Beef, factor: 4 }, { key: "carbs", label: "Carbs", Icon: Wheat, factor: 4 }, { key: "fat", label: "Fat", Icon: Droplet, factor: 9 }] as const).map(({key,label,Icon,factor}) => <div className={"macro-card " + key} key={key}>
              <strong>{unavailable ? "—" : fmt(totals[key])}<span>g</span></strong><p>{label} logged</p>
              <NutritionRing progress={unavailable || !macroEnergy ? 0 : totals[key] * factor / macroEnergy} className="macro-ring"><Icon size={17} /></NutritionRing>
            </div>)}
          </div>
          <p className="macro-caption">{meals.some(m => m.protein === null || m.carbs === null || m.fat === null) ? "Some macro values are missing · Rings show recorded calorie share" : "Macro rings show each nutrient’s calorie share"}</p>
        </section>
        <section className="meals-panel">
          <div className="section-heading"><h2>Recently logged</h2><span className="muted">{dayTitle}</span></div>
          {loading ? <div className="empty-meals"><LoaderCircle className="animate-spin" aria-label="Loading meals"/></div> : error ? <div className="empty-meals"><p>Your meals couldn’t load. Try again above.</p></div> : meals.length === 0 ? <div className="empty-meals"><span className="empty-icon"><Utensils size={25}/></span><h3>Your day starts here</h3><p>Tap + to add your first meal.</p><Button variant="outline" onClick={() => setAddOpen(true)}><Plus/> Add a meal</Button></div> : <div className="meal-list">{meals.map(meal => <article className="meal-row" key={meal.id}>
            <button className="meal-photo-button" aria-label={"Edit " + meal.title} onClick={() => openMeal(meal)}>{meal.imageKey ? <img className="meal-photo" src={"/api/photos?key=" + encodeURIComponent(meal.imageKey)} alt={meal.title} loading="lazy"/> : <span className="meal-photo meal-placeholder"><Utensils size={25}/></span>}</button>
            <div className="meal-info"><div className="meal-title-line"><button onClick={() => openMeal(meal)} title={meal.title}>{meal.title}</button><span className="meal-time">{meal.createdAt ? new Date(meal.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : meal.mealType}</span></div>
              <p className="meal-calories"><Flame size={15} fill="currentColor"/><strong>{fmt(meal.calories)}</strong> calories</p>
              <div className="meal-macros"><span className="protein"><Beef size={13}/>{meal.protein ?? "—"}g</span><span className="carbs"><Wheat size={13}/>{meal.carbs ?? "—"}g</span><span className="fat"><Droplet size={13}/>{meal.fat ?? "—"}g</span></div>
              <div className="meal-bottom"><span>{meal.mealType}{meal.source === "ai" ? " · Estimate" : ""}</span><button aria-label={"Remove " + meal.title} onClick={() => setRemove(meal)}><Trash2 size={13}/></button></div>
            </div>
          </article>)}</div>}
        </section>
      </TabsContent>
      <TabsContent value="progress">
        <section className="progress-panel"><div className="section-heading"><h2>Your progress</h2><button className="calendar-link" aria-label="Choose progress date" onClick={() => setCalendarOpen(true)}><CalendarDays size={16}/></button></div><p className="muted progress-subtitle">The 7 days ending {dayTitle.toLowerCase()}.</p>
          <div className="progress-total"><strong>{unavailable ? "—" : fmt(week.reduce((sum,d) => sum + d.calories, 0))}</strong><span>calories logged</span></div>
          <div className="week-bars">{date && Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6)).map(day => {
            const row = week.find(w => w.date === day); const max = Math.max(...week.map(w => w.calories), 1);
            return <button className={"week-day " + (day === date ? "selected" : "")} key={day} onClick={() => { setDate(day); setView("home"); }} aria-label={day + ": " + (row ? fmt(row.calories) + " calories" : "no meals logged")}><span>{unavailable ? "—" : row ? fmt(row.calories) : "—"}</span><div className="bar-track"><div style={{ height: row && !unavailable ? Math.max(3, row.calories / max * 100) + "%" : "3px" }}/></div><span>{new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}</span></button>;
          })}</div><p className="progress-note">Tap a day to view its meals.</p>
        </section>
      </TabsContent>
      <div className="bottom-dock">
        <div className="nav-pill">
          <TabsList aria-label="Journal views"><TabsTrigger value="home"><House/><span>Home</span></TabsTrigger><TabsTrigger value="progress"><ChartNoAxesColumn/><span>Progress</span></TabsTrigger></TabsList>
          <Button className="settings-nav" variant="ghost" onClick={() => { setGoalInput(goal?.toString() ?? ""); setFormError(""); setSettingsOpen(true); }}><Settings2/><span>Settings</span></Button>
        </div>
        <Button className="floating-add" size="icon" aria-label="Add a meal" disabled={!date} onClick={() => setAddOpen(true)}><Plus size={30}/></Button>
      </div>
    </Tabs>
    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="add-meal-dialog max-h-[90svh] overflow-y-auto"><DialogHeader className="sr-only"><DialogTitle>Add a meal</DialogTitle><DialogDescription>Choose a meal photo, text or voice note, or enter calories manually.</DialogDescription></DialogHeader><Composer date={date} aiReady={settings?.aiReady ?? null} onReview={openMeal} resetKey={composerReset}/></DialogContent></Dialog>
    <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}><DialogContent><DialogHeader><DialogTitle>Choose a date</DialogTitle><DialogDescription>Open any day in your food journal.</DialogDescription></DialogHeader><div className="date-controls"><Button variant="outline" size="icon" aria-label="Previous day" disabled={!date} onClick={() => setDate(shiftDate(date, -1))}><ArrowLeft/></Button><Input type="date" aria-label="Journal date" value={date} onChange={e => { if(e.target.value) setDate(e.target.value); }}/><Button variant="outline" size="icon" aria-label="Next day" disabled={!date} onClick={() => setDate(shiftDate(date, 1))}><ArrowRight/></Button></div><Button onClick={() => { setDate(localDate()); setCalendarOpen(false); }}>Today</Button><Button variant="outline" onClick={() => setCalendarOpen(false)}>View selected day</Button></DialogContent></Dialog>

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
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>Your settings</DialogTitle><DialogDescription>Choose a daily goal if you want one.</DialogDescription></DialogHeader><form className="meal-form" onSubmit={saveGoal}><label>Daily calorie goal<Input type="number" min={1} max={20000} step={1} value={goalInput} placeholder="No goal" onChange={e => setGoalInput(e.target.value)}/></label><p className="muted text-sm">Leave empty to track without a target.</p>{formError && <p className="text-destructive" role="alert">{formError}</p>}<Button disabled={busy}>Save settings</Button></form><div className="model-settings"><strong>{settings?.aiReady ? "AI connected" : "AI waiting for your API key"}</strong><p>Photos: GPT-4.1 mini<br/>Text: GPT-4o mini<br/>Voice: GPT-4o mini Transcribe</p><p>Only the meal you submit is sent for analysis. Your journal stays on your private Site.</p><a className="gallery-link" href="/gallery">Open your image gallery</a><a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer" className="text-link">OpenAI API pricing</a></div></DialogContent></Dialog>
    <AlertDialog open={!!remove} onOpenChange={open => { if (!open && !busy) setRemove(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this meal?</AlertDialogTitle><AlertDialogDescription>{remove?.title} will be removed from your journal and daily totals.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep meal</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void deleteMeal(); }}>{busy ? "Removing…" : "Remove meal"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function NutritionRing({ progress, children, className }: { progress: number; children: React.ReactNode; className: string }) {
  return <div className={"nutrition-ring " + className} aria-hidden="true"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" className="ring-track" strokeWidth="6"/><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={264} strokeDashoffset={264 * (1 - Math.max(0, Math.min(1, progress)))} transform="rotate(-90 50 50)"/></svg><span className="ring-icon">{children}</span></div>;
}
