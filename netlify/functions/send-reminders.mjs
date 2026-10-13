// Läuft alle 5 Minuten: verschickt fällige Erinnerungen und den Morgen-Überblick.
import { admin, vapidKeys, sendToUser, localParts, toMinutes, catName } from "../lib/push.mjs";

const MORNING_WINDOW_MIN = 180; // verspätete Läufe holen den Überblick bis zu 3 Stunden nach

const fmtDay = (iso) => { const [, m, d] = iso.split("-"); return `${d}.${m}.`; };
const prioRank = { hoch: 0, mittel: 1, niedrig: 2 };

async function customCatsFor(db, userId) {
  const { data } = await db.from("user_settings").select("custom_cats").eq("user_id", userId).maybeSingle();
  return data?.custom_cats || [];
}

async function sendReminders(db, keys, now) {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await db.from("todos")
    .select("id, user_id, text, category, priority, end_date, remind_at, reminded_at")
    .eq("done", false).lte("remind_at", now.toISOString()).gte("remind_at", since);
  if (error) throw new Error("todos: " + error.message);
  const due = (data || []).filter((t) => !t.reminded_at || Date.parse(t.reminded_at) < Date.parse(t.remind_at));
  let count = 0;
  for (const t of due) {
    const cats = await customCatsFor(db, t.user_id);
    const bits = [catName(t.category, cats)];
    if (t.priority === "hoch") bits.push("Priorität hoch");
    if (t.end_date) bits.push("fällig " + fmtDay(t.end_date));
    await sendToUser(db, keys, t.user_id, { title: t.text, body: "Erinnerung · " + bits.join(" · "), tag: "todo-" + t.id });
    await db.from("todos").update({ reminded_at: now.toISOString() }).eq("id", t.id);
    count++;
  }
  return count;
}

async function sendMorning(db, keys, now) {
  const { data: settings, error } = await db.from("notification_settings")
    .select("user_id, digest_enabled, start_enabled, notify_time, timezone, last_morning_date")
    .or("digest_enabled.eq.true,start_enabled.eq.true");
  if (error) throw new Error("notification_settings: " + error.message);
  let count = 0;
  for (const s of settings || []) {
    const local = localParts(now, s.timezone);
    const start = toMinutes(s.notify_time);
    if (local.minutes < start || local.minutes > start + MORNING_WINDOW_MIN) continue;
    if (s.last_morning_date === local.date) continue;

    const { data: todos, error: tErr } = await db.from("todos")
      .select("text, priority, start_date, end_date").eq("user_id", s.user_id).eq("done", false);
    if (tErr) { console.error(tErr); continue; }
    const byPrio = (a, b) => prioRank[a.priority] - prioRank[b.priority];
    const overdue = todos.filter((t) => t.end_date && t.end_date < local.date).sort(byPrio);
    const today = todos.filter((t) => t.end_date === local.date).sort(byPrio);
    const starting = todos.filter((t) => t.start_date === local.date).sort(byPrio);

    let payload = null;
    if (s.digest_enabled && (overdue.length || today.length || (s.start_enabled && starting.length))) {
      const head = [];
      if (today.length) head.push(`${today.length} heute fällig`);
      if (overdue.length) head.push(`${overdue.length} überfällig`);
      if (s.start_enabled && starting.length) head.push(`${starting.length} ${starting.length === 1 ? "startet" : "starten"} heute`);
      const lines = [
        ...overdue.map((t) => "• " + t.text + " (überfällig)"),
        ...today.map((t) => "• " + t.text + (t.priority === "hoch" ? " (hoch)" : "")),
        ...(s.start_enabled ? starting.filter((t) => !today.includes(t)).map((t) => "• Start: " + t.text) : []),
      ];
      const shown = lines.slice(0, 4);
      if (lines.length > shown.length) shown.push(`… und ${lines.length - shown.length} weitere`);
      payload = { title: "Dein Tag: " + head.join(" · "), body: shown.join("\n"), tag: "morning-" + local.date };
    } else if (s.start_enabled && starting.length) {
      payload = {
        title: starting.length === 1 ? "Startet heute" : `${starting.length} Aufgaben starten heute`,
        body: starting.slice(0, 4).map((t) => "• " + t.text).join("\n"),
        tag: "start-" + local.date,
      };
    }
    if (payload) { await sendToUser(db, keys, s.user_id, payload); count++; }
    await db.from("notification_settings").update({ last_morning_date: local.date }).eq("user_id", s.user_id);
  }
  return count;
}

export default async () => {
  const now = new Date();
  try {
    const db = admin();
    const keys = await vapidKeys(db);
    const reminders = await sendReminders(db, keys, now);
    const mornings = await sendMorning(db, keys, now);
    console.log(`Erinnerungen: ${reminders}, Morgen-Überblicke: ${mornings}`);
    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response(String(e.message || e), { status: 500 });
  }
};

export const config = { schedule: "*/5 * * * *" };
