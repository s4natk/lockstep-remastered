import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { unstable_dev } from "wrangler";

const directory = await mkdtemp(join(tmpdir(), "lockstep-credential-isolation-"));
const resolved = resolve(directory);
const relativePath = relative(resolve(tmpdir()), resolved);
if (
  isAbsolute(relativePath) ||
  relativePath.startsWith("..") ||
  !basename(resolved).startsWith("lockstep-credential-isolation-")
) {
  throw new Error("Refusing cleanup outside the isolated temporary test directory");
}
try {
  const script = join(directory, "health.mjs");
  const config = join(directory, "wrangler.json");
  await writeFile(
    script,
    "export default { fetch(_request, env) { return Response.json({ configured: Boolean(env.OPENAI_API_KEY?.trim()) }); } };",
  );
  await writeFile(
    config,
    JSON.stringify({
      name: "lockstep-test-provider-isolation",
      main: "health.mjs",
      compatibility_date: "2026-10-04",
      vars: { OPENAI_API_KEY: "fixture-only-config-value" },
    }),
  );
  await writeFile(join(directory, ".dev.vars"), "OPENAI_API_KEY=fixture-only-not-a-real-key\n");
  for (const override of [{ vars: { OPENAI_API_KEY: "" } }, { var: ["OPENAI_API_KEY:"] }]) {
    const worker = await unstable_dev(script, {
      config,
      local: true,
      ...override,
      experimental: { disableExperimentalWarning: true, forceLocal: true },
    });
    try {
      const response = await worker.fetch("http://localhost/health");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).configured, false);
    } finally {
      await worker.stop();
    }
  }
  console.log(
    "Test provider isolation: explicit API vars and CLI blank --var override dummy .dev.vars credentials",
  );
} finally {
  await rm(resolved, { recursive: true, force: true });
}
