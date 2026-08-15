# WhatsApp bot (OpenClaw) — setup

What this adds: a set of read-only API endpoints in this app that an OpenClaw
agent calls to (1) answer stock questions in the WhatsApp group, (2) send an
instant ping the moment a submitted count crosses a product's low-stock
threshold, (3) post a daily digest. No sales/POS data — "consumption" is
computed the same way the admin dashboard already computes it: yesterday's
count + today's restocks − today's count.

**Risk to know before you start:** OpenClaw connects to WhatsApp by pairing
a real phone number via QR code (WhatsApp Web protocol) — this is *not*
Meta's official Business API. Automating a number this way is against
WhatsApp's terms, and numbers doing this occasionally get banned with no
warning. Use a spare number/SIM for this, not the shop's main line or your
personal number.

## 1. Database migration

In Supabase SQL Editor, run `supabase/migrations/004_bot_alerts.sql`. It adds
one table (`bot_alerts_sent`) used only to stop the bot re-pinging every time
someone re-saves an already-low count on the same day.

## 2. Vercel environment variables

Project Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key (secret — never share this) |
| `BOT_API_SECRET` | any long random string you make up — this is the password OpenClaw uses to call your app |
| `SUPABASE_WEBHOOK_SECRET` | another long random string — Supabase uses this to prove the alert webhook is really from Supabase |
| `OPENCLAW_WEBHOOK_URL` | leave blank for now — fill in after step 4 |

Redeploy after adding these (Vercel → Deployments → ⋯ → Redeploy on the latest one).

## 3. Supabase → instant low-stock alert

Supabase dashboard → **Database → Webhooks → Create a new webhook**:
- Table: `count_lines`
- Events: `Insert` only
- Type: `HTTP Request`
- URL: `https://YOUR-APP.vercel.app/api/bot/alert-check`
- HTTP Headers: add `x-webhook-secret` = the `SUPABASE_WEBHOOK_SECRET` value from step 2

This fires every time a count line is written (i.e. every submit/edit). The
endpoint itself decides whether that product is actually low and whether an
alert for it was already sent today — most calls do nothing.

## 4. Create the OpenClaw instance

1. Go to OpenClaw Launch, create a new instance (Lite plan is enough to start).
2. Connect WhatsApp: scan the QR code with the spare number from the warning above.
3. Create a WhatsApp group with that number and your cousin, or add the number
   to an existing group.
4. In the OpenClaw instance settings, find its **inbound webhook / trigger
   URL** (used to push a message into a chat without being asked first) and
   put that URL into Vercel's `OPENCLAW_WEBHOOK_URL` env var, then redeploy.
   *(OpenClaw Launch's exact naming for this may differ from self-hosted
   OpenClaw's docs — look for "webhook," "trigger," or "inbound message" in
   its settings. If there's no such feature on Launch, tell me and I'll
   switch step 3 to a polling approach instead — see note at the bottom.)*

## 5. Give OpenClaw the skill

In the OpenClaw instance, add a workspace skill (or just paste this as
instructions/system context for the agent in that WhatsApp chat) — replace
`YOUR-APP` and `YOUR_BOT_API_SECRET`:

```
You help manage stock for an açaí shop chain. You can call these endpoints
(all GET, header "Authorization: Bearer YOUR_BOT_API_SECRET"):

- https://YOUR-APP.vercel.app/api/bot/status?location=<optional name>
  Current stock per product per location, flags what's low.
- https://YOUR-APP.vercel.app/api/bot/consumption?days=7&location=<optional name>
  Consumption per product over the last N days (default 7).
- https://YOUR-APP.vercel.app/api/bot/missing
  Which locations haven't submitted today's count yet.
- https://YOUR-APP.vercel.app/api/bot/summary
  A full daily digest, includes a ready-to-send "text" field.

Answer in European Portuguese (pt-PT), short and direct. When asked about
stock, consumption, or missing counts, call the relevant endpoint — don't
guess numbers.
```

## 6. Daily digest — cron

Configure OpenClaw's built-in scheduler (`openclaw cron add` if it exposes a
CLI/terminal on Launch, otherwise its dashboard's "scheduled task" UI) to run
once a day, e.g. 20:00 Europe/Lisbon:
- Call `GET https://YOUR-APP.vercel.app/api/bot/summary` with the bearer token above.
- Send the response's `text` field to the WhatsApp group.

## 7. Test

- Ask the bot in the WhatsApp group: "quanto stock temos de X?" — should call
  `/api/bot/status` and answer.
- In the admin app, edit a count so a product's quantity is at/below its
  low-stock threshold and submit. Within a minute or two you should get the
  instant WhatsApp alert.
- Manually trigger the daily digest job once to check formatting before
  trusting the schedule.

---

**If OpenClaw Launch doesn't support inbound webhooks or built-in cron**
(unconfirmed from public docs at the time this was built — flagged in the
research, not guessed): fall back to polling. Add a Vercel Cron job (free
tier allows daily/hourly crons) that hits `/api/bot/alert-check`-style logic
every 5–10 minutes instead of via the Supabase webhook, and have it push to
WhatsApp through whatever "send message" API OpenClaw Launch does expose
(most hosted agent platforms have at least a send-message REST call even
without a scheduler). Tell me once you're in the OpenClaw dashboard and I'll
adjust to whatever's actually there — the endpoints in step 5 don't change
either way.
