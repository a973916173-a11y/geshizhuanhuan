/**
 * One-shot: create Neon Postgres → prisma migrate deploy → push DATABASE_URL / NEXTAUTH_* to Vercel → deploy --prod
 *
 * Requires Node 18+ (fetch). Set NEON_API_KEY (Neon Console → Account settings → API keys).
 * Optional: put NEON_API_KEY in ./neon.keys.env (gitignored).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");

function loadNeonKeysFile() {
  const keysPath = path.join(root, "neon.keys.env");
  if (!fs.existsSync(keysPath)) return;
  const raw = fs.readFileSync(keysPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    // File must win over empty inherited env (e.g. NEON_API_KEY="" blocks Neon API).
    if (k && v) {
      process.env[k] = v;
    }
  }
}

loadNeonKeysFile();

const NEON_API_KEY = process.env.NEON_API_KEY?.trim();
const PRODUCTION_URL =
  process.env.VERCEL_PRODUCTION_URL?.trim() ||
  "https://webp-tool-a973916173-3801s-projects.vercel.app";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, envExtra = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...envExtra },
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

function vercelEnvAdd(name, environment, value) {
  run("npx", [
    "vercel",
    "env",
    "add",
    name,
    environment,
    "--value",
    value,
    "--yes",
    "--force",
  ]);
}

async function neonFetch(url, options = {}) {
  const headers = {
    Authorization: `Bearer ${NEON_API_KEY}`,
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`Neon API ${res.status}: ${text.slice(0, 800)}`);
  }
  return json;
}

async function resolveNeonOrgId() {
  const explicit = process.env.NEON_ORG_ID?.trim();
  if (explicit) return explicit;
  const data = await neonFetch("https://console.neon.tech/api/v2/users/me/organizations");
  const org = data.organizations?.[0];
  if (!org?.id) {
    throw new Error(
      "No Neon organization found. Open https://console.neon.tech and complete signup, then retry."
    );
  }
  console.log(`Using Neon organization: ${org.name} (${org.id})`);
  return org.id;
}

async function waitForNeonProjectReady(projectId) {
  const pending = new Set(["running", "scheduling", "pending", "in_progress"]);
  for (let i = 0; i < 90; i++) {
    const data = await neonFetch(
      `https://console.neon.tech/api/v2/projects/${projectId}/operations`
    );
    const ops = data.operations ?? [];
    const active = ops.filter((o) => pending.has(o.status));
    // Do not exit while ops list is still empty (setup not registered yet).
    if (ops.length === 0 && i < 15) {
      await sleep(2000);
      continue;
    }
    if (active.length === 0) {
      return;
    }
    await sleep(2000);
  }
  console.warn("Warning: timed out waiting for Neon operations; continuing anyway.");
}

async function main() {
  if (!NEON_API_KEY) {
    console.error(`
Missing NEON_API_KEY.

1) Open https://console.neon.tech/app/settings/api-keys and create an API key.
2) Create file "${path.join(root, "neon.keys.env")}" with one line:
   NEON_API_KEY=napi_your_key_here

Or run: set NEON_API_KEY=napi_...   (PowerShell / CMD) then npm run deploy:production
`);
    process.exit(1);
  }

  const orgId = await resolveNeonOrgId();

  const projectName = `webp-tool-${Date.now()}`;
  console.log(`Creating Neon project "${projectName}"...`);

  const created = await neonFetch("https://console.neon.tech/api/v2/projects", {
    method: "POST",
    body: JSON.stringify({
      project: {
        name: projectName,
        region_id: "aws-us-east-1",
        org_id: orgId,
      },
    }),
  });

  const projectId = created.project?.id;
  let connectionUri = created.connection_uris?.[0]?.connection_uri;
  if (!projectId || !connectionUri) {
    console.error(JSON.stringify(created, null, 2));
    throw new Error("Unexpected Neon create response (missing project id or connection URI).");
  }

  if (!connectionUri.includes("sslmode=")) {
    connectionUri += (connectionUri.includes("?") ? "&" : "?") + "sslmode=require";
  }

  console.log("Waiting for Neon branch / compute to finish provisioning...");
  await waitForNeonProjectReady(projectId);
  await sleep(3000);

  console.log("Applying Prisma migrations to the new database...");
  run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: connectionUri });

  const nextAuthSecret = crypto.randomBytes(32).toString("base64url");

  console.log("Uploading environment variables to Vercel (production)...");
  vercelEnvAdd("DATABASE_URL", "production", connectionUri);
  vercelEnvAdd("NEXTAUTH_URL", "production", PRODUCTION_URL);
  vercelEnvAdd("NEXTAUTH_SECRET", "production", nextAuthSecret);

  console.log("Deploying to Vercel production...");
  run("npx", ["vercel", "deploy", "--prod", "--yes"]);

  console.log(`
Done.
Production URL: ${PRODUCTION_URL}
Neon project:   ${projectName} (${projectId})

Save NEXTAUTH_SECRET locally if you need to decrypt sessions elsewhere — it was just set on Vercel (encrypted).
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
