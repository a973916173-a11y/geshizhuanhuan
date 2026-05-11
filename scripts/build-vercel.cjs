/**
 * Vercel build: run migrations only when DATABASE_URL is a Postgres URL (same as production DB).
 * Ensures `next build` can proceed once env vars are added to the project.
 */
const { spawnSync } = require("child_process");

const env = { ...process.env };
const dbUrl = env.DATABASE_URL ?? "";
const hasPostgres =
  dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

function run(cmd, args) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: require("path").join(__dirname, ".."),
    env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

run("npx", ["prisma", "generate"]);
if (hasPostgres) {
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.warn(
    "[build-vercel] DATABASE_URL missing or not Postgres — skipping prisma migrate deploy. Add DATABASE_URL on Vercel and redeploy so migrations apply."
  );
}
run("npx", ["next", "build"]);
