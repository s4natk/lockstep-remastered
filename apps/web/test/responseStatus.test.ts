import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FallbackNotice,
  ResponseMode,
  ServiceStatus,
} from "../src/components/sidekick/ResponseStatus.tsx";
import { ReportPanel } from "../src/components/sidekick/ReportPanel.tsx";
import { fixtureReport } from "./fixtures.ts";

const render = (component: Parameters<typeof createElement>[0], props: object) =>
  renderToStaticMarkup(createElement(component, props));

test("a configured key is not represented as a verified AI response", () => {
  const html = render(ServiceStatus, { connection: "ai" });
  assert.ok(html.includes("AI key present"));
  assert.ok(html.includes("Provider requests are not yet verified"));
  assert.ok(!html.includes("AI response"));
  const offline = render(ServiceStatus, { connection: "evidence" });
  assert.ok(offline.includes("No AI key configured"));
  assert.ok(offline.includes("Responses use deterministic guidance"));
});

test("authentication fallback is visible even while a key is present", () => {
  const report = fixtureReport();
  report.warnings = [
    { code: "provider_fallback", message: "Generic fallback" },
    { code: "provider_authentication", message: "private-provider-response-body" },
  ];
  const service = render(ServiceStatus, { connection: "ai", report });
  assert.ok(service.includes("AI key present"));
  assert.ok(service.includes("Saved response used deterministic guidance"));
  const badge = render(ResponseMode, { report, mode: "ai" });
  assert.ok(badge.includes("Deterministic fallback"));
  assert.ok(!badge.includes("AI response"));
  const notice = render(FallbackNotice, { report });
  assert.ok(notice.includes("provider rejected authentication"));
  assert.ok(notice.includes("server-side API key"));
  assert.ok(notice.includes("no model-generated answer was used"));
  assert.ok(!notice.includes("private-provider-response-body"));
});

test("specific safe reasons take priority over the generic compatibility warning", () => {
  for (const [code, expected] of [
    ["provider_quota", "quota or billing limit"],
    ["provider_rate_limited", "rate limit was reached"],
    ["provider_model_unavailable", "configured model could not be accessed"],
    ["provider_timeout", "request timed out"],
    ["provider_invalid_report", "could not be validated"],
    ["provider_incomplete", "incomplete answer"],
    ["provider_refused", "declined to answer"],
  ]) {
    const report = fixtureReport();
    report.warnings = [
      { code: "provider_fallback", message: "private-provider-response-body" },
      { code: code!, message: "private-provider-response-body" },
    ];
    const html = render(FallbackNotice, { report });
    assert.ok(html.includes(expected!), code);
    assert.ok(!html.includes("private-provider-response-body"), code);
  }
});

test("unknown warnings stay out of the inline reason and missing keys are distinguished", () => {
  const report = fixtureReport();
  report.warnings = [{ code: "provider_vendor_detail", message: "private-provider-response-body" }];
  assert.ok(!render(FallbackNotice, { report }).includes("private-provider-response-body"));
  assert.ok(render(ResponseMode, { report }).includes("Deterministic guidance"));
  report.warnings = [{ code: "provider_not_configured", message: "No configured provider" }];
  assert.ok(render(FallbackNotice, { report }).includes("No AI key is configured on the server"));
  assert.ok(!render(ResponseMode, { report }).includes("fallback"));
});

test("successful AI and interrupted responses retain their actual status", () => {
  const report = fixtureReport();
  report.mode = "ai";
  assert.ok(render(ResponseMode, { report }).includes("AI response"));
  assert.equal(render(FallbackNotice, { report }), "");
  assert.ok(render(ServiceStatus, { connection: "ai", report }).includes("Saved response used AI"));
  assert.ok(render(ResponseMode, { report, status: "cancelled" }).includes("Turn stopped"));
  assert.ok(render(ResponseMode, { report, status: "failed" }).includes("Incomplete response"));
});

test("the structured report displays the same safe provider failure reason", () => {
  const report = fixtureReport();
  report.warnings = [
    { code: "provider_authentication", message: "Provider authentication failed." },
  ];
  const html = render(ReportPanel, { report, initialTab: "report", onClose: () => {} });
  assert.ok(html.includes("Deterministic fallback"));
  assert.ok(html.includes("provider rejected authentication"));
});
