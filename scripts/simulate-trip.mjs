/**
 * Simulate a delivery driving from origin A -> destination B by posting
 * GPS pings to /api/track. A stand-in for real hardware — no device needed.
 *
 * Run:
 *   npm run simulate -- --delivery <delivery_id>
 *   npm run simulate -- --token <tracking_token> --steps 30 --interval 1500
 *   npm run simulate -- --delivery <id> --base https://your-app.vercel.app
 *
 * Options: --delivery <id> | --token <token>, --steps (40), --interval ms (1500),
 *          --base (http://localhost:3000), --deliver (mark delivered at the end)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing env. Run via: npm run simulate -- --delivery <id>");
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) (out[key] = val), i++;
      else out[key] = true;
    }
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lerp = (a, b, t) => a + (b - a) * t;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const steps = Number(args.steps) || 40;
  const interval = Number(args.interval) || 1500;
  const base = (args.base || "http://localhost:3000").replace(/\/$/, "");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let q = supabase
    .from("deliveries")
    .select("id, reference, origin_lat, origin_lng, dest_lat, dest_lng");
  if (args.delivery) q = q.eq("id", args.delivery);
  else if (args.token) q = q.eq("tracking_token", args.token);
  else {
    console.error("Provide --delivery <id> or --token <tracking_token>");
    process.exit(1);
  }

  const { data: d, error } = await q.maybeSingle();
  if (error || !d) {
    console.error("Delivery not found.");
    process.exit(1);
  }
  if (
    d.origin_lat == null ||
    d.origin_lng == null ||
    d.dest_lat == null ||
    d.dest_lng == null
  ) {
    console.error("Delivery is missing origin/destination coordinates.");
    process.exit(1);
  }

  console.log(
    `Simulating ${d.reference || d.id}: A(${d.origin_lat},${d.origin_lng}) -> B(${d.dest_lat},${d.dest_lng})`,
  );

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const lat = lerp(d.origin_lat, d.dest_lat, t);
    const lng = lerp(d.origin_lng, d.dest_lng, t);
    const res = await fetch(`${base}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId: d.id, lat, lng, speed: 40 }),
    });
    process.stdout.write(
      `\r  ${Math.round(t * 100)}%  (${lat.toFixed(4)}, ${lng.toFixed(4)})  [${res.status}]   `,
    );
    if (i < steps) await sleep(interval);
  }
  console.log("\n✓ Reached destination.");

  if (args.deliver) {
    await supabase
      .from("deliveries")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", d.id);
    console.log("✓ Marked delivered.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
