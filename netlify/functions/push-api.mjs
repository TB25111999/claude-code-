// Schnittstelle für die App:
//   GET  /api/push/key   → öffentlicher VAPID-Schlüssel zum Anmelden eines Geräts
//   POST /api/push/test  → Testnachricht an alle eigenen Geräte (mit Login-Token)
import { admin, vapidKeys, sendToUser, json } from "../lib/push.mjs";

export default async (req) => {
  const action = new URL(req.url).pathname.split("/").pop();
  try {
    const db = admin();
    if (req.method === "GET" && action === "key") {
      const keys = await vapidKeys(db);
      return json({ publicKey: keys.publicKey });
    }
    if (req.method === "POST" && action === "test") {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "Nicht angemeldet." }, 401);
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user) return json({ error: "Anmeldung abgelaufen. Melde dich neu an." }, 401);
      const keys = await vapidKeys(db);
      const sent = await sendToUser(db, keys, data.user.id, {
        title: "Benachrichtigungen sind aktiv",
        body: "So sehen deine Erinnerungen aus.",
        tag: "test",
      });
      if (!sent) return json({ error: "Kein Gerät angemeldet. Tippe zuerst auf „Auf diesem Gerät erlauben“." }, 404);
      return json({ sent });
    }
    return json({ error: "Unbekannte Anfrage." }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: e.message || "Serverfehler" }, 500);
  }
};

export const config = { path: "/api/push/*" };
