import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const git = (args, input) =>
  execFileSync("git", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }).trim();
const release = process.argv.includes("--release");
const commitCount = Number(git(["rev-list", "--count", "HEAD"]));
if (release) {
  git(["diff", "--check"]);
  git(["diff", "--cached", "--check"]);
}

const forbidden =
  /(^|\/)(node_modules|\.next|dist|build|coverage|\.wrangler|\.turbo|\.cache|target|\.codex|\.agents|\.cursor|\.claude|\.windsurf|\.aider[^/]*|\.openai|\.continue|\.roo|\.kilocode|\.opencode|\.gemini|\.goose|\.amazonq|\.qodo|\.clinerules|\.cursorrules|\.windsurfrules|AGENTS\.md|CLAUDE\.md|GEMINI\.md|SKILL\.md|copilot-instructions\.md|\.mcp(?:\.json)?|mcp\.json|\.vscode|\.idea|\.aws|\.ssh|\.azure|\.gcloud|\.vercel|\.netlify|\.direnv|\.pnpm-store)(\/|$)|(^|\/)\.github\/(instructions|prompts|agents)(\/|$)|(^|\/)\.config\/gcloud(\/|$)/i;
const protectedFile =
  /(^|\/)(\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.envrc|\.git-credentials|\.netrc|_netrc|id_rsa[^/]*|id_ed25519[^/]*)$|\.(pem|key|p12|pfx|keystore|log|sqlite3?|db)(?:-(?:journal|wal|shm))?$|(?:credentials|service-account)[^/]*\.json$/i;
const listPaths = (args) => git(args).split("\0").filter(Boolean);
const filenames = listPaths(["ls-files", "-z"]);
const workingFiles = [
  ...new Set([...filenames, ...listPaths(["ls-files", "--others", "--exclude-standard", "-z"])]),
];
const historicalFiles = new Set(workingFiles);
for (const hash of git(["rev-list", "--all"]).split("\n")) {
  for (const filename of listPaths(["ls-tree", "-r", "--name-only", "-z", hash]))
    historicalFiles.add(filename);
}
for (const filename of historicalFiles) {
  const template = /(^|\/)(\.env\.example|\.dev\.vars\.example)$/.test(filename);
  if (forbidden.test(filename) || (protectedFile.test(filename) && !template))
    throw new Error(`Forbidden path in repository history: ${filename}`);
}
const objects = git(["rev-list", "--objects", "--all"])
  .split("\n")
  .map((line) => line.split(" ")[0]);
const listing = git(
  ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
  objects.join("\n") + "\n",
);
const stagedBlobs = listPaths(["ls-files", "--stage", "-z"]).map(
  (entry) => entry.split("\t")[0].split(" ")[1],
);
const historicalBlobs = listing
  .split("\n")
  .filter((line) => line.split(" ")[1] === "blob")
  .map((line) => line.split(" ")[0]);
const blobs = [...new Set([...historicalBlobs, ...stagedBlobs])];
const batch = execFileSync("git", ["cat-file", "--batch"], {
  input: blobs.join("\n") + "\n",
  maxBuffer: 128 * 1024 * 1024,
});
let offset = 0;
const corpus = [];
let textBlobs = 0;
let binaryBlobs = 0;
const historicalBinaryBuildPaths = [];
const binaryText = (body) =>
  [
    ...(body.toString("latin1").match(/[\x20-\x7e]{4,}/g) ?? []),
    ...(body.toString("utf16le").match(/[\x20-\x7e]{4,}/g) ?? []),
  ].join("\n");
const privateHomePath =
  /(?:[A-Z]:[\\/](?:Users|Documents and Settings)[\\/][^\s/\\]+|\/(?:Users|home)\/(?!runner\b|builder\b)[^\s/]+)/i;
while (offset < batch.length) {
  const newline = batch.indexOf(10, offset);
  const [hash, type, length] = batch.subarray(offset, newline).toString("utf8").split(" ");
  if (type !== "blob") throw new Error("Unexpected Git object type");
  const size = Number(length);
  const body = batch.subarray(newline + 1, newline + 1 + size);
  offset = newline + 1 + size + 1;
  const binary = body.includes(0);
  const source = binary ? binaryText(body) : body.toString("utf8");
  if (
    /sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/:]+:[^\s/@]+@/.test(
      source,
    )
  )
    throw new Error(`Credential candidate in history blob ${hash}`);
  if (privateHomePath.test(source)) {
    if (!binary) throw new Error(`Personal filesystem path in history blob ${hash}`);
    historicalBinaryBuildPaths.push(hash);
  }
  corpus.push(`\n--- Git blob ${hash} ---\n`, source);
  if (binary) binaryBlobs += 1;
  else textBlobs += 1;
}
for (const filename of workingFiles) {
  let body;
  try {
    body = readFileSync(filename);
  } catch {
    continue;
  }
  const source = body.includes(0) ? binaryText(body) : body.toString("utf8");
  if (
    /sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/:]+:[^\s/@]+@/.test(
      source,
    )
  )
    throw new Error(`Credential candidate in working file: ${filename}`);
  if (privateHomePath.test(source))
    throw new Error(`Personal filesystem path in working file: ${filename}`);
  corpus.push(`\n--- Working file ${filename} ---\n`, source);
}
const require = createRequire(import.meta.url);
const scanner = join(dirname(require.resolve("secretlint/package.json")), "bin/secretlint.js");
const scanned = spawnSync(
  process.execPath,
  [scanner, "--stdinFileName", "repository-history.txt"],
  { input: corpus.join("\n"), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
if (scanned.error) throw scanned.error;
if (scanned.status !== 0) {
  process.stderr.write(scanned.stdout ?? "");
  process.stderr.write(scanned.stderr ?? "");
  throw new Error("Secretlint history scan failed (values are masked)");
}
console.log(
  JSON.stringify(
    {
      commits: commitCount,
      trackedFiles: filenames.length,
      historyTextBlobs: textBlobs,
      historyBinaryBlobs: binaryBlobs,
      historicalBinaryBuildPaths: [...new Set(historicalBinaryBuildPaths)],
      secretlint: "passed",
      releaseChecks: release ? "passed" : "not requested",
    },
    null,
    2,
  ),
);
