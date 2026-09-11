import { Apple, Flame, Target, CalendarDays } from "lucide-react";
import { shiftDate } from "@/lib/meals";

export default function ProgressView({ date, week, goal, unavailable, onDay }: { date: string; week: { date: string; calories: number; count: number }[]; goal: number | null | undefined; unavailable: boolean; onDay: (day: string) => void }) {
  const days = date ? Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6)) : [];
  const logged = week.filter(d => d.count > 0);
  const total = week.reduce((sum, d) => sum + d.calories, 0);
  const average = logged.length ? Math.round(total / logged.length) : 0;
  const max = Math.max(...week.map(d => d.calories), goal || 0, 100);
  const points = days.map((day, i) => { const row = week.find(d => d.date === day); return { day, row, x: 36 + i * 44, y: 168 - ((row?.calories || 0) / max) * 128 }; });
  return <div className="progress-screen">
    <div className="progress-stat-grid"><div className="progress-stat"><StatRing fraction={goal ? average / goal : 0}><Flame/></StatRing><span>Daily average</span><strong>{unavailable ? "—" : average.toLocaleString()} <small>kcal</small></strong><p>On days you logged</p></div><div className="progress-stat"><StatRing fraction={logged.length / 7} accent><Apple/></StatRing><span>Days logged</span><strong>{unavailable ? "—" : logged.length} <small>of 7 days</small></strong><p>This past week</p></div></div>
    <div className="progress-period"><CalendarDays size={16}/><span>{date ? new Date(shiftDate(date, -6) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " – " + new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Past 7 days"}</span><span>7 days</span></div>
    <section className="trend-card"><div className="section-heading"><h2>Calorie trend</h2>{goal && <span className="goal-badge"><Target size={13}/>{goal.toLocaleString()} goal</span>}</div>
      {unavailable ? <div className="trend-empty">Your progress will appear when your meals load.</div> : logged.length === 0 ? <div className="trend-empty"><Flame size={30}/><h3>A little progress, every day</h3><p>Log your first meal to start your chart.</p></div> : <>
        <svg className="trend-chart" viewBox="0 0 320 200" role="img" aria-label="Daily calories over the past seven days. Exact values are listed below.">
          {[0, .5, 1].map(f => <g key={f}><line x1="36" x2="306" y1={168 - f * 128} y2={168 - f * 128} stroke="#e6e6eb" strokeDasharray="3 4"/><text x="30" y={172 - f * 128} textAnchor="end" fill="#86848d" fontSize="11">{Math.round(max * f)}</text></g>)}
          {goal && <line x1="36" x2="306" y1={168 - goal / max * 128} y2={168 - goal / max * 128} stroke="#929098" strokeDasharray="5 5"/>}
          {points.slice(1).map((p, i) => p.row && points[i].row ? <line key={p.day} x1={points[i].x} y1={points[i].y} x2={p.x} y2={p.y} stroke="#76b96c" strokeWidth="2.5"/> : null)}
          {points.map(p => <g key={p.day}>{p.row && <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#76b96c" strokeWidth="2.5"/>}<text x={p.x} y="192" textAnchor="middle" fontSize="12" fill="#86848d">{new Date(p.day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}</text></g>)}
        </svg><p className="trend-caption">{total.toLocaleString()} calories logged this week</p></>}
    </section>
    <section className="progress-days"><h2>Your week</h2>{points.map(({ day, row }) => <button key={day} onClick={() => onDay(day)}><span>{new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })}<small>{row ? row.count + (row.count === 1 ? " meal" : " meals") : "No meals logged"}</small></span><strong>{unavailable ? "—" : row ? row.calories.toLocaleString() + " kcal" : "—"}</strong></button>)}</section>
  </div>;
}
function StatRing({ fraction, accent, children }: { fraction: number; accent?: boolean; children: React.ReactNode }) {
  return <div className={"stat-ring " + (accent ? "accent" : "")} aria-hidden="true"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="43" fill="none" stroke="#f1f0f5" strokeWidth="5"/><circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="270.2" strokeDashoffset={270.2 * (1 - Math.min(1, Math.max(0, fraction)))} transform="rotate(-90 50 50)"/></svg><span>{children}</span></div>;
}
