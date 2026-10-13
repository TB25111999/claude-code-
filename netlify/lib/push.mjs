// Gemeinsame Bausteine für die Netlify-Funktionen: Datenbankzugang, VAPID-Schlüssel, Versand.
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://usbghofvvepfddhxcvds.supabase.co";

export function admin() {
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Umgebungsvariable SUPABASE_SECRET_KEY fehlt (Netlify → Project configuration → Environment variables).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// VAPID-Schlüssel werden beim ersten Aufruf erzeugt und in push_config gespeichert,
// damit niemand sie von Hand anlegen oder kopieren muss.
let cachedKeys = null;
export async function vapidKeys(db) {
  if (cachedKeys) return cachedKeys;
  let { data, error } = await db.from("push_config").select("vapid_public, vapid_private").eq("id", 1).maybeSingle();
  if (error) throw new Error("push_config nicht lesbar: " + error.message + " – wurde supabase/benachrichtigungen.sql ausgeführt?");
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    const ins = await db.from("push_config").upsert({ id: 1, vapid_public: k.publicKey, vapid_private: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    if (ins.error) throw new Error("push_config nicht beschreibbar: " + ins.error.message);
    ({ data, error } = await db.from("push_config").select("vapid_public, vapid_private").eq("id", 1).single());
    if (error) throw new Error(error.message);
  }
  cachedKeys = { publicKey: data.vapid_public, privateKey: data.vapid_private };
  return cachedKeys;
}

function subject() {
  return process.env.PUSH_SUBJECT || process.env.URL || "https://timtodos.netlify.app";
}

// Schickt eine Nachricht an alle Geräte einer Person. Abgemeldete Geräte werden aufgeräumt.
export async function sendToUser(db, keys, userId, payload) {
  const { data: subs, error } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 6 * 3600, urgency: "high" },
      );
      sent++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("Push fehlgeschlagen", s.endpoint.slice(0, 60), e && (e.statusCode || e.message), e && e.body);
    }
  }
  return sent;
}

// ---------- Zeit in der Zeitzone der Person ----------
export function localParts(date, timeZone) {
  let tz = timeZone;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); } catch { tz = "Europe/Berlin"; }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export const toMinutes = (hhmm) => { const [h, m] = String(hhmm || "07:00").split(":").map(Number); return h * 60 + m; };

const BASE_CATS = { trading: "Trading", techniker: "Techniker", fitness: "Fitness", arbeit: "Arbeit", privat: "Privat", finanzen: "Finanzen", lernen: "Lernen", haushalt: "Haushalt" };
export function catName(id, custom) {
  if (BASE_CATS[id]) return BASE_CATS[id];
  const c = (Array.isArray(custom) ? custom : []).find((x) => x && x.id === id);
  return c ? String(c.name) : "Sonstiges";
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
