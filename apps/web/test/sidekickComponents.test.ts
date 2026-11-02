import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText, CodeView } from "../src/components/sidekick/RichText.tsx";
import { ReportPanel } from "../src/components/sidekick/ReportPanel.tsx";
import { KnowledgePanel } from "../src/components/sidekick/KnowledgePanel.tsx";
import { fixtureReport } from "./fixtures.ts";
test("assistant markdown renders safe code, lists, links and visible copy controls", () => {
  const html = renderToStaticMarkup(
    createElement(RichText, {
      source:
        '### Check this first\n\n**A fact** and `value`.\n\n```typescript\nconst value = "<script>bad</script>";\n```\n\n- Reproduce\n- Verify\n\n[unsafe](javascript:alert(1))',
    }),
  );
  assert.ok(html.includes("Copy code"));
  assert.ok(html.includes("ls-token-keyword"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
});
test("the code inspector escapes untrusted content and stays keyboard reachable", () => {
  const html = renderToStaticMarkup(
    createElement(CodeView, { code: "<img src=x onerror=alert(1)>", language: "html" }),
  );
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(html.includes("Copy code"));
});
test("evidence panel uses actual report sources and explains citation limits", () => {
  const html = renderToStaticMarkup(
    createElement(ReportPanel, { report: fixtureReport(), onClose: () => {} }),
  );
  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(html.includes("Selected evidence"));
  assert.ok(html.includes("does not prove"));
  assert.ok(html.includes("input:"));
});
test("knowledge empty state offers real paste and bounded UTF-8 upload controls", () => {
  const html = renderToStaticMarkup(
    createElement(KnowledgePanel, {
      documents: [],
      selectedIds: [],
      busy: false,
      onSelect: async () => {},
      onAdded: async () => {},
      onDelete: async () => {},
      onClose: () => {},
    }),
  );
  for (const text of [
    "Paste context",
    "Upload file",
    "Upload context file",
    "32 KB",
    "Pin up to 12",
  ])
    assert.ok(html.includes(text), text);
});
