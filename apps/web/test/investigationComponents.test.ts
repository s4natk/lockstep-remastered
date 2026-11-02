import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportView } from "../src/components/investigation/ReportView.tsx";
import { EvidenceInspector } from "../src/components/investigation/EvidenceInspector.tsx";
import { ExamplePicker } from "../src/components/investigation/ExamplePicker.tsx";
import { fixtureReport } from "./fixtures.ts";

test("structured report renders facts, guidance, caveats, and traceable evidence controls", () => {
  const html = renderToStaticMarkup(createElement(ReportView, { report: fixtureReport() }));
  for (const text of [
    "Deterministic analysis",
    "Observed evidence",
    "Working hypothesis",
    "Recommended remediation",
    "Verify the fix",
    "Missing context",
    "Evidence inspector",
    "Export JSON",
  ])
    assert.ok(html.includes(text), text);
  assert.ok(html.includes("Inspect evidence"));
  assert.ok(!html.includes("NaN"));
});
test("source content is escaped and unsafe source URLs never become links", () => {
  const report = fixtureReport();
  report.evidence[0]!.content = '<script>alert("unsafe")</script>';
  report.evidence[0]!.provenance.url = "javascript:alert(1)";
  const html = renderToStaticMarkup(
    createElement(EvidenceInspector, {
      evidence: report.evidence,
      selectedId: report.evidence[0]!.id,
      onSelect: () => {},
    }),
  );
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
});
test("example selector has an associated label and respects disabled state", () => {
  const html = renderToStaticMarkup(
    createElement(ExamplePicker, { value: "", disabled: true, onChange: () => {} }),
  );
  assert.ok(html.includes('for="failure-example"'));
  assert.ok(html.includes("disabled"));
  assert.ok(html.includes("Python"));
  assert.ok(html.includes("PostgreSQL"));
});
