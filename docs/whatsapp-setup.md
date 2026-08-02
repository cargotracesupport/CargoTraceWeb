# WhatsApp automation — setup guide

CargoTrace can send customers automated WhatsApp updates ("on the way", "delivered")
from a **business-branded sender** using the **Meta WhatsApp Cloud API**.

**How it works:** a Supabase **Database Webhook** on the `deliveries` table calls
`POST /api/hooks/whatsapp` on every row change. That endpoint diffs the delivery's
old → new `status` and sends the matching **pre-approved template** via Meta's Graph
API ([`src/lib/whatsapp.ts`](../src/lib/whatsapp.ts)). Catching changes at the
database means every transition fires **exactly once**, no matter where it came from
(driver app, agent, GPS ingest).

Until the `WHATSAPP_*` env vars are set the whole thing is **inert** — nothing sends,
nothing breaks.

> **The one hard requirement:** WhatsApp has no "name-only" sender. You need **one
> dedicated phone number** that is *not* currently used on the normal WhatsApp /
> WhatsApp Business app. It can be a cheap prepaid SIM or a virtual number — it just
> has to receive one SMS/call to verify. Customers see your **business display name**,
> not the raw number.

---

## Part A — Meta side (do this first; verification has lead time)

1. **Create a Meta Business account** — <https://business.facebook.com> → *Settings →
   Business info*. Use your real business details.

2. **Start Business Verification** — *Security Center → Start Verification*. This can
   take a few days (Meta checks documents), so kick it off early. You can build and
   test in the meantime with the temporary test number.

3. **Create a Meta App** — <https://developers.facebook.com/apps> → *Create app* →
   type **Business** → add the **WhatsApp** product.

4. **Note your test setup** — under *WhatsApp → API Setup* you get a free **test
   sender number** and a 24-hour token. Good for a first end-to-end test before your
   real number/verification is ready. Add your own mobile as a test recipient there.

5. **Add your dedicated number** — *WhatsApp → API Setup → Add phone number*. Verify
   it by SMS/call. ⚠️ If that number is on the normal WhatsApp app, delete that
   account first (Settings → Account → Delete). Once it's on the API it can't be used
   in the app simultaneously.

6. **Set the display name** — *WhatsApp Manager → Phone numbers → your number →
   Profile → Display name*. This is the **business name customers see**. Meta reviews
   it (usually quick). Must reasonably match your business.

7. **Create the message templates** (Part C below) and wait for **Approved** status.

8. **Get a PERMANENT token** — the API-Setup token expires in 24h. For production
   create a **System User**: *Business Settings → Users → System users → Add* → give
   it an *Admin* role and **Assign the WhatsApp app** with full control → *Generate
   token* → select the app, no expiry, scopes **`whatsapp_business_messaging`** and
   **`whatsapp_business_management`**. Copy it — you won't see it again.

9. **Collect these three values** for the env vars:
   - **Phone number ID** — *WhatsApp → API Setup* (the long numeric id under your
     sender number — **not** the phone number itself).
   - **Permanent access token** — from step 8.
   - Your chosen **template language code** (e.g. `en`).

---

## Part B — App / hosting side

1. **Pick a webhook secret** — any long random string (e.g. `openssl rand -hex 24`).

2. **Set env vars** in Vercel (*Project → Settings → Environment Variables*) and,
   for local testing, in `.env.local`. See [`.env.example`](../.env.example):

   | Variable | Value |
   | --- | --- |
   | `WHATSAPP_PHONE_NUMBER_ID` | the numeric Phone number ID |
   | `WHATSAPP_ACCESS_TOKEN` | the permanent System-User token |
   | `WHATSAPP_WEBHOOK_SECRET` | your random secret (also used in Part D) |
   | `WHATSAPP_DEFAULT_COUNTRY_CODE` | `91` (India) — prefixed to bare local numbers |
   | `WHATSAPP_TEMPLATE_LANG` | must match the template language, e.g. `en` |

   Redeploy on Vercel after adding them.

3. **(Optional)** set `WHATSAPP_SEND_ON_BOOKED=true` to also auto-send the "set your
   drop-off" message when a delivery is created. Off by default because the manual
   *Send on WhatsApp* button already covers that step.

---

## Part C — The templates (submit in Meta, category **Utility**)

Create these in *WhatsApp Manager → Message templates → Create template*. Category
**Utility**, language matching `WHATSAPP_TEMPLATE_LANG`. The variable order below
**must match** — the app fills them in this exact order (see `TEMPLATES` in
[`src/lib/whatsapp.ts`](../src/lib/whatsapp.ts)).

**`ct_en_route`** — sent when a driver starts the trip (`→ en_route`):
```
Hi {{1}}, your delivery {{2}} is on the way. Track it live and see the ETA here: {{3}} We'll message you again once it's delivered.
```
Variables: `{{1}}` customer name · `{{2}}` reference · `{{3}}` tracking link.
Sample values for review: `Daniel` · `CT-88888` · `https://cargo-trace-web.vercel.app/track/…`

**`ct_delivered`** — sent when the driver marks it delivered (`→ delivered`):
```
Hi {{1}}, your delivery {{2}} has been delivered. Thank you for choosing us!
```
Variables: `{{1}}` customer name · `{{2}}` reference.

**`ct_booked`** — only if you set `WHATSAPP_SEND_ON_BOOKED=true` (on creation):
```
Hi {{1}}, your delivery {{2}} is booked. Please open this link to set your drop-off location: {{3}} It only takes a moment.
```
Variables: `{{1}}` name · `{{2}}` reference · `{{3}}` link.

> If you name the templates differently, override with `WHATSAPP_TEMPLATE_EN_ROUTE`,
> `WHATSAPP_TEMPLATE_DELIVERED`, `WHATSAPP_TEMPLATE_BOOKED`.
>
> Tip: instead of the link in the body ({{3}}), you can add a **URL button** with a
> dynamic suffix — Meta prefers that for links. If you do, tell me and I'll adjust the
> payload in `whatsapp.ts` to send a button parameter.

---

## Part D — Wire up the Supabase Database Webhook

1. Supabase Dashboard → **Database → Webhooks → Create a new hook**.
2. **Table:** `public.deliveries`. **Events:** ☑ Insert ☑ Update.
3. **Type:** HTTP Request → **POST** →
   `https://cargo-trace-web.vercel.app/api/hooks/whatsapp`
4. **HTTP Headers:** add `x-webhook-secret` = the same value as
   `WHATSAPP_WEBHOOK_SECRET`.
5. Save.

The endpoint verifies that header, so only Supabase can trigger sends. Update events
include the old row, which is how we detect the exact `status` transition (and ignore
the constant GPS-position updates).

---

## Part E — Test

1. With a delivery whose `customer_phone` is a WhatsApp-enabled number (and, on the
   free test tier, added as a test recipient in Meta):
   ```bash
   npm run simulate -- --token <tracking_token>
   ```
   The first GPS ping flips `assigned → en_route` → you should receive the
   **`ct_en_route`** message. Add `--deliver` to also fire **`ct_delivered`**.
2. If nothing arrives, check **Vercel → your project → Logs** for `[whatsapp] …`
   lines, and **Supabase → Webhooks → your hook → Logs** for the delivery attempt and
   the response body (it reports `{ ok, event, skipped?, error? }`).

### Common gotchas
- **`skipped: "not_configured"`** — env vars missing on the deployment (redeploy).
- **`skipped: "no_valid_phone"`** — `customer_phone` couldn't be normalized; check
  `WHATSAPP_DEFAULT_COUNTRY_CODE`.
- **Template errors** — the `name`/`language` must match Meta exactly and be
  **Approved**; the variable count must match.
- **Outside the free tier / 24h window** — business-initiated template messages are
  billed per conversation; make sure billing is set up in Meta.
