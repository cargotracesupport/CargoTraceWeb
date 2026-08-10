/**
 * Create a new company + its first admin (invite-only onboarding).
 *
 * Run:
 *   npm run create-company -- --company "Acme Builders" --email admin@acme.com --password "secret123" --name "Jane Doe"
 * Or interactively (it will prompt for anything missing):
 *   npm run create-company
 *
 * The admin's email is pre-confirmed, so they can sign in immediately at /login.
 * A DB trigger auto-creates the organization + admin profile.
 */
import { createClient } from "@supabase/supabase-js";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Run via:  npm run create-company  (which loads .env.local)\n" +
      "Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        out[key] = val;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input, output });

  const company =
    args.company || (await rl.question("Company name: ")).trim();
  const name = args.name || (await rl.question("Admin full name: ")).trim();
  const email = (args.email || (await rl.question("Admin email: ")).trim()).toLowerCase();
  const password =
    args.password || (await rl.question("Admin password (min 6 chars): ")).trim();
  rl.close();

  if (!company || !name || !email || password.length < 6) {
    console.error("\n✗ company, name, email and a 6+ char password are all required.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pre-confirmed: can log in right away
    user_metadata: { org_name: company, full_name: name },
  });

  if (error) {
    console.error(`\n✗ Could not create admin: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n✓ Company "${company}" created.`);
  console.log(`  Admin: ${name} <${email}>  (user id ${data.user.id})`);
  console.log(`  They can sign in now at /login with the password you set.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
