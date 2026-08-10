# CargoTrace

A compact, dark, data-dense **delivery-tracking** web app — think fleet control panel. A sender business creates deliveries (goods moving from origin **A** to destination **B**), assigns a driver / vehicle / GPS device, and watches them move on a live map. The receiving customer just opens a public link and watches their delivery approach with a live map + ETA.

---

## 1. What CargoTrace is

The central object is a **Delivery**: goods going from origin A to destination B.

There are three kinds of people:

- **Admin (the sender business)** — signs up, which creates their organization. Creates deliveries, manages the fleet (drivers, vehicles, GPS devices), assigns a driver/vehicle/device to each delivery, and watches everything live on a map.
- **Driver** — logs in (created by the admin), sees only the deliveries assigned to them, marks them delivered, and — until real GPS hardware is fitted — shares their phone's foreground GPS so the delivery shows up live.
- **Customer (the receiver)** — has **no login**. They open a public tracking link (`/track/{token}`) and watch the delivery approach with a live map and ETA.

**GPS, now and later:** Real tracking comes from hardware on the vehicle that POSTs its position to the API using a `hardwareId`. Until that hardware is installed, the assigned driver's phone fills the gap by sending its foreground GPS keyed by `deliveryId`. Both paths feed the same live map.

---

## 2. Stack

- **Frontend / app:** Next.js 14 (App Router) + TypeScript + Tailwind CSS, deployed on **Vercel**.
- **Backend:** [Supabase](https://supabase.com/) — Postgres (with **PostGIS**), Auth, Realtime, and Row Level Security (RLS) that auto-scopes every query to the signed-in user's org/role.
- **Maps:** [MapLibre GL](https://maplibre.org/) for rendering, with map tiles from [MapTiler](https://www.maptiler.com/) (free tier).

---

## 3. Setup

Do these in order.

1. **Create a Supabase project** at [supabase.com](https://supabase.com/). Wait for it to finish provisioning.

2. **Run the schema.** Open the project's **SQL Editor**, paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and run it. This creates all tables, PostGIS bits, and the RLS policies.

3. **Auth — no extra setup needed.** This app is **invite-only**: there is no public sign-up. Admins and drivers are created server-side with their email **pre-confirmed** (via the `create-company` command and the in-app *Add driver*), so you can leave Supabase's email-confirmation setting at its default.

4. **Environment variables.** Copy the example file and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Where to get it |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` secret (**server-only — never expose to the browser**) |
   | `NEXT_PUBLIC_MAPTILER_KEY` | Free key from [maptiler.com](https://www.maptiler.com/) |
   | `NEXT_PUBLIC_APP_URL` | Your app's public base URL (e.g. `http://localhost:3000` in dev). No trailing slash — used to build customer tracking links. |

5. **Install dependencies and run:**

   ```bash
   npm install
   npm run dev
   ```

   Then open [http://localhost:3000](http://localhost:3000).

---

## 4. Using it

1. **Create your company + admin.** There is no public sign-up — you create each company. Run:

   ```bash
   npm run create-company -- --company "Acme Builders" --email admin@acme.com --password "a-strong-password" --name "Jane Doe"
   ```

   (or just `npm run create-company` and answer the prompts). The admin can sign in immediately at `/login`.

2. **Build your fleet.** Go to **Fleet** and add:
   - a **driver** login (full name + email + password — this creates a driver account scoped to your org),
   - a **vehicle** (name + plate),
   - a **GPS device** with its `hardware_id` (the id the physical tracker will report).

3. **Create a delivery.** Fill in the goods, origin and destination, and customer details. Assign a **driver**, **vehicle**, and **device**. Save, then **copy the tracking link** for the customer.

4. **As the driver:** sign in on a phone. You'll see only your assigned deliveries. Until real hardware is installed, tap **"Share location"** to stream your phone's foreground GPS so the delivery goes live. Mark it **delivered** when you arrive.

5. **As the customer:** open the tracking link (`/track/{token}`). No login required — you'll see the delivery approach on a live map with an ETA.

---

## 5. Hardware / API

Positions are ingested by a single endpoint: **`POST /api/track`**.

**Hardware path** — the physical GPS tracker identifies itself with its `hardwareId` (the device's `hardware_id`):

```bash
curl -X POST https://your-app.example.com/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "hardwareId": "DEV-DEMO-001",
    "lat": 14.5995,
    "lng": 120.9842,
    "speed": 42,
    "heading": 110,
    "recordedAt": "2026-06-19T08:30:00Z"
  }'
```

**Phone path (interim)** — the driver's phone reports against a specific delivery with `deliveryId`:

```bash
curl -X POST https://your-app.example.com/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "deliveryId": "00000000-0000-0000-0000-000000000000",
    "lat": 14.5995,
    "lng": 120.9842,
    "speed": 42
  }'
```

Both return `{ "ok": true }`. `speed`, `heading`, and `recordedAt` are optional. To onboard real hardware you only need it to POST that JSON — register the tracker's id as a device's `hardware_id` in **Fleet**, assign that device to a delivery, and the points flow straight onto the live map.

---

## 6. Deploy

1. Push the repo to **GitHub**.
2. Import the repo into **[Vercel](https://vercel.com/)**.
3. Set the **same environment variables** as in step 3.4 in the Vercel project settings. Keep `SUPABASE_SERVICE_ROLE_KEY` **server-only** (do not prefix it with `NEXT_PUBLIC_`; it must never reach the browser). Set `NEXT_PUBLIC_APP_URL` to your production URL.
4. **Deploy.**

---

## Reference

The original clickable prototype now lives at [`reference/CT.prototype.html`](reference/CT.prototype.html) — open it directly in a browser to see the intended look and flow.
