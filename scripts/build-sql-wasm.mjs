import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const crate = join(root, "packages", "sql_guard");
const output = join(crate, "target", "public-pkg");
const userRoot = homedir();
const env = { ...process.env };
delete env.RUSTFLAGS;
env.CARGO_ENCODED_RUSTFLAGS = [
  "-C",
  "strip=symbols",
  `--remap-path-prefix=${userRoot}=/build/user`,
  `--remap-path-prefix=${root}=/src`,
].join("\x1f");
const launcher =
  process.platform === "win32"
    ? (process.env.PATH ?? "")
        .split(delimiter)
        .map((directory) => join(directory, "node_modules", "wasm-pack", "run.js"))
        .find(existsSync)
    : undefined;
const result = spawnSync(
  launcher ? process.execPath : "wasm-pack",
  [
    ...(launcher ? [launcher] : []),
    "build",
    crate,
    "--target",
    "web",
    "--release",
    "--no-opt",
    "--out-dir",
    output,
  ],
  { cwd: root, env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);
if (result.error || result.status !== 0) {
  const details = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .replaceAll(root, "/src")
    .replaceAll(userRoot, "/build/user");
  process.stderr.write(details);
  throw new Error("WASM build failed; install wasm-pack and the wasm32-unknown-unknown target.");
}
const binary = readFileSync(join(output, "sql_guard_bg.wasm"));
const strings = binary.toString("latin1") + "\n" + binary.toString("utf16le");
if (/[A-Z]:[\\/]Users[\\/]|\/(?:Users|home)\/(?!runner\b|builder\b)/i.test(strings))
  throw new Error("WASM still contains a private home path; generated files were not published.");
if (!WebAssembly.validate(binary)) throw new Error("Generated WASM is invalid.");
const destination = join(crate, "pkg");
mkdirSync(destination, { recursive: true });
for (const filename of ["sql_guard_bg.wasm", "sql_guard.js", "sql_guard.d.ts", "package.json"])
  copyFileSync(join(output, filename), join(destination, filename));
console.log(
  `Built valid, path-remapped SQL WASM (${binary.byteLength} bytes) and matching web bindings.`,
);
