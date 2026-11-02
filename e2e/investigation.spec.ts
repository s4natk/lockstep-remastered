import { test, expect, type Page, type Locator } from "@playwright/test";
import { fixtureReport } from "../apps/web/test/fixtures";
import { FAILURE_EXAMPLES } from "../apps/web/src/lib/investigationExamples";
async function noOverflow(page: Page) {
  expect(
    await page.locator(".ls-app").evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
}
async function contrast(locator: Locator) {
  const value = await locator.evaluate((element) => {
    const rgba = (source: string) => source.match(/[\d.]+/g)!.map(Number);
    const ancestors: Element[] = [];
    let node: Element | null = element;
    while (node) {
      ancestors.unshift(node);
      node = node.parentElement;
    }
    let background = [255, 255, 255];
    for (const item of ancestors) {
      const color = rgba(getComputedStyle(item).backgroundColor);
      const alpha = color[3] ?? 1;
      background = background.map(
        (channel, index) => color[index]! * alpha + channel * (1 - alpha),
      );
    }
    const light = (color: number[]) =>
      color
        .slice(0, 3)
        .map((channel) => {
          const v = channel / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index]!, 0);
    const a = light(rgba(getComputedStyle(element).color)),
      b = light(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(value).toBeGreaterThanOrEqual(4.5);
}
async function send(page: Page, message: string, count = 1) {
  await page.getByRole("textbox", { name: "Message Lockstep" }).fill(message);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".ls-assistant-turn")).toHaveCount(count);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await expect(page.locator(".ls-assistant-turn").last().locator(".ls-answer-tools")).toBeVisible();
}
async function investigate(page: Page, id = "python") {
  await page.goto("/");
  await send(page, FAILURE_EXAMPLES.find((example) => example.id === id)!.input);
}

test("original workspace, keyboard focus, mobile and tablet layouts", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What are we investigating?" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to workspace" })).toBeFocused();
  await page.keyboard.press("Tab");
  await contrast(page.locator(".ls-welcome>p"));
  await contrast(page.locator(".ls-new-thread"));
  await page.screenshot({ path: info.outputPath("agent-desktop.png"), fullPage: true });
  await noOverflow(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("agent-tablet.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("agent-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Workspace" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Trace an exception", exact: false }).click();
  await expect(page.getByRole("textbox", { name: "Message Lockstep" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Message Lockstep" })).toContainText("Traceback");
});
for (const id of [
  "python",
  "javascript",
  "java",
  "rust",
  "test",
  "http",
  "logs",
  "database",
  "sql",
]) {
  test(`real ${id} investigation uses evidence-backed agent response`, async ({ page }, info) => {
    await investigate(page, id);
    await expect(page.locator(".ls-assistant-turn").last()).toContainText("Deterministic guidance");
    await expect(page.locator(".ls-assistant-turn").last()).toContainText(
      "no model-generated answer was used",
    );
    await page
      .locator(".ls-answer-tools")
      .last()
      .getByRole("button", { name: /Inspect \d+ sources/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Investigation details" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Selected evidence" })).toBeVisible();
    if (id === "logs")
      await expect(page.getByRole("region", { name: "Log event timeline" })).toBeVisible();
    await page.getByRole("tab", { name: "Report", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Verification", exact: true })).toBeVisible();
    if (id === "python") {
      await page.screenshot({ path: info.outputPath("report-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath("report-mobile.png"), fullPage: true });
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await noOverflow(page);
  });
}

test("conversation follow-ups keep the same thread and persist across reload", async ({
  page,
}, info) => {
  await investigate(page);
  const url = page.url();
  await page.getByRole("button", { name: "How can I verify the fix?", exact: false }).click();
  await send(page, "How can I verify the fix?", 2);
  expect(page.url()).toBe(url);
  await expect(page.locator(".ls-user-turn")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".ls-assistant-turn")).toHaveCount(2);
  await expect(page.locator(".ls-user-turn").first()).toContainText("postal_code");
  await page.screenshot({ path: info.outputPath("conversation-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("conversation-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog", { name: "Workspace" })
    .getByRole("link", { name: /All investigations/ })
    .click();
  await expect(page.locator(".ls-history-list article")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("history-mobile.png"), fullPage: true });
});

test("private knowledge is saved, pinned, retrieved, isolated, and deleted", async ({
  page,
  browser,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Context", exact: false }).first().click();
  await page.getByRole("button", { name: "Paste context", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Shipping service runbook");
  await page
    .getByRole("textbox", { name: "Content", exact: true })
    .fill(
      "SHIPPING_RUNBOOK_MARKER: The order service expects address.postal_code. Validate the address payload before building a shipment. Missing postal codes should produce a validation response. Reproduce the missing-key request and add a regression test.",
    );
  await page.getByRole("button", { name: "Save context", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Pin Shipping service runbook" })).toBeChecked();
  await page.screenshot({ path: info.outputPath("knowledge-desktop.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await send(page, FAILURE_EXAMPLES[0]!.input);
  await page
    .locator(".ls-answer-tools")
    .getByRole("button", { name: /Inspect \d+ sources/ })
    .click();
  await page
    .locator(".ls-sources button")
    .filter({ hasText: "Shipping service runbook" })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "Selected evidence" })).toContainText(
    "SHIPPING_RUNBOOK_MARKER",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".ls-assistant-turn")).toHaveCount(1);
  await page.getByRole("button", { name: "Context", exact: false }).first().click();
  await expect(page.getByRole("checkbox", { name: "Pin Shipping service runbook" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Pin Shipping service runbook" }).uncheck();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Context", exact: false }).first().click();
  await expect(
    page.getByRole("checkbox", { name: "Pin Shipping service runbook" }),
  ).not.toBeChecked();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("http://localhost:3000");
  await otherPage.getByRole("button", { name: "Context", exact: false }).first().click();
  await expect(otherPage.locator(".ls-library-item")).toHaveCount(0);
  await other.close();
  await page.getByRole("button", { name: "Delete Shipping service runbook", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".ls-library-item")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Context", exact: false }).first().click();
  await expect(page.locator(".ls-library-item")).toHaveCount(0);
});

test("text and code file upload is real and rejects unsupported binary files", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add context", exact: true }).click();
  await page.getByLabel("Upload context file").setInputFiles({
    name: "profile.ts",
    mimeType: "text/plain",
    buffer: Buffer.from("export function getProfile(user) { return user?.email ?? null; }"),
  });
  await expect(page.getByRole("checkbox", { name: "Pin profile.ts" })).toBeChecked();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".ls-context-preview")).toContainText("export function getProfile");
  await page.getByLabel("Upload context file").setInputFiles({
    name: "binary.p12",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 255, 0]),
  });
  await expect(page.locator(".ls-alert[role=alert]")).toContainText("not supported");
});

test("history opens the actual thread, isolates owners and deletes without fake entries", async ({
  page,
  browser,
}, info) => {
  await investigate(page, "javascript");
  await page.getByRole("link", { name: /All investigations/ }).click();
  await expect(page.locator(".ls-history-list article")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("history-desktop.png"), fullPage: true });
  await page.locator(".ls-history-list article>a").click();
  await expect(page.locator(".ls-assistant-turn")).toHaveCount(1);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("http://localhost:3000/history");
  await expect(otherPage.getByRole("heading", { name: "A fresh page, for now." })).toBeVisible();
  await other.close();
  await page.getByRole("link", { name: /All investigations/ }).click();
  await page.getByRole("button", { name: /Delete investigation/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A fresh page, for now." })).toBeVisible();
});

test("malformed model stream and network failures preserve a usable composer", async ({ page }) => {
  await page.route("**/api/threads/*/messages", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"type":"message","message":{"content":"invalid"}}\n\n',
    }),
  );
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message Lockstep" }).fill("TypeError: failed");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".ls-main [role=alert]")).toContainText("unreadable");
  await expect(page.getByRole("textbox", { name: "Message Lockstep" })).toBeEnabled();
  await expect(page.locator(".ls-assistant-turn")).toHaveCount(0);
  await page.unroute("**/api/threads/*/messages");
  await page.route("**/api/threads/*/messages", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".ls-main [role=alert]")).toContainText("unreachable");
  await expect(page.getByRole("textbox", { name: "Message Lockstep" })).toBeEnabled();
});

test("cancellation does not resubmit and the saved thread can be recovered", async ({ page }) => {
  let release = () => {};
  let count = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/threads/*/messages", async (route) => {
    count++;
    await held;
    await route.abort().catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message Lockstep" }).fill(FAILURE_EXAMPLES[0]!.input);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => count).toBe(1);
  await page.getByRole("button", { name: "Stop investigation", exact: true }).click();
  release();
  await expect(page.getByRole("textbox", { name: "Message Lockstep" })).toBeEnabled();
  await page.waitForLoadState("networkidle");
  expect(count).toBe(1);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Message Lockstep" })).toBeEnabled();
});

test("the validated fallback replaces provisional text and explains a failed provider request", async ({
  page,
}, info) => {
  await page.route("**/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, openai: { configured: true } }),
    }),
  );
  let savedThread: unknown = null;
  await page.route("**/api/threads/*", async (route) => {
    if (route.request().method() === "GET" && savedThread)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(savedThread),
      });
    else await route.fallback();
  });
  await page.route("**/api/threads/*/messages", async (route) => {
    const threadId = new URL(route.request().url()).pathname.split("/")[3]!;
    const input = route.request().postDataJSON();
    const now = new Date().toISOString();
    const report = fixtureReport();
    report.warnings = [
      { code: "provider_fallback", message: "Deterministic guidance replaced provisional text." },
      { code: "provider_authentication", message: "The provider rejected authentication." },
    ];
    const message = {
      id: "mock-answer",
      threadId,
      role: "assistant",
      content: "Validated final answer.",
      createdAt: now,
      status: "complete",
      mode: "deterministic",
      report,
      clientTurnId: input.clientTurnId,
      contextIds: [],
    };
    savedThread = {
      id: threadId,
      title: "TypeError investigation",
      kind: "runtime_exception",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      lastPreview: message.content,
      contextIds: [],
      messages: [
        {
          id: "mock-user",
          threadId,
          role: "user",
          content: input.message,
          createdAt: now,
          status: "complete",
          clientTurnId: input.clientTurnId,
          contextIds: [],
        },
        message,
      ],
    };
    const events = [
      {
        type: "delta",
        threadId,
        turnId: input.clientTurnId,
        content: "PROVISIONAL_UNSUPPORTED_CLAIM",
        provisional: true,
      },
      { type: "message", message },
      { type: "done", threadId, turnId: input.clientTurnId },
    ];
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    });
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message Lockstep" }).fill("TypeError: failed");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Validated final answer.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "made by @s4natk" })).toHaveAttribute(
    "href",
    "https://github.com/s4natk/lockstep-remastered",
  );
  await expect(page.locator(".ls-assistant-turn .ls-answer-mode")).toHaveText(
    "Deterministic fallback",
  );
  await expect(page.locator(".ls-deterministic-note")).toContainText(
    "provider rejected authentication",
  );
  await contrast(page.locator(".ls-deterministic-note"));
  await page.screenshot({ path: info.outputPath("fallback-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await expect(page.locator(".ls-deterministic-note")).toBeVisible();
  await page.screenshot({ path: info.outputPath("fallback-mobile.png"), fullPage: true });
  await expect(page.getByText("PROVISIONAL_UNSUPPORTED_CLAIM", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message Lockstep" })).toBeEnabled();
});

test("SQL uses the same agent and help explains real limits", async ({ page }) => {
  await page.goto("/sql");
  await expect(page.getByRole("combobox", { name: "Failure category" })).toHaveValue(
    "sql_migration",
  );
  await send(page, "DROP TABLE sessions;\nCREATE INDEX users_email_idx ON users (email);");
  await expect(page.locator(".ls-assistant-turn")).toContainText(/drop|loss|migration/i);
  await page.getByRole("link", { name: "How Lockstep works", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Start with the failure. Keep asking better questions." }),
  ).toBeVisible();
});

test("oversized messages and malformed environment details are rejected before sending", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Message Lockstep" }).fill("x".repeat(32769));
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".ls-main [role=alert]")).toContainText("32768");
  await page.getByRole("textbox", { name: "Message Lockstep" }).fill("TypeError: failed");
  await page.getByRole("button", { name: "Environment", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Environment · one KEY=value per line" })
    .fill("not-a-pair");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".ls-main [role=alert]")).toContainText("KEY=value");
});
test("navigating away from an interrupted turn cannot replace the selected thread", async ({
  page,
}) => {
  await page.goto("/investigate");
  await send(page, FAILURE_EXAMPLES[0]!.input);
  const firstId = new URL(page.url()).searchParams.get("thread")!;
  await page.getByRole("link", { name: "New investigation", exact: true }).click();
  await send(page, FAILURE_EXAMPLES.find((item) => item.id === "http")!.input);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/threads/*/messages", async (route) => {
    await held;
    await route.abort().catch(() => {});
  });
  await page.getByRole("textbox", { name: "Message Lockstep" }).fill("What should I inspect?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop investigation", exact: true })).toBeVisible();
  await page.locator(`.ls-recent-threads a[href*="${firstId}"]`).click();
  release();
  await expect(page.locator(".ls-user-turn").first()).toContainText("postal_code");
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).searchParams.get("thread")).toBe(firstId);
  await expect(page.locator(".ls-user-turn").first()).toContainText("postal_code");
});

test("SQLite failures receive a database investigation in the shared agent", async ({ page }) => {
  await page.goto("/");
  await send(
    page,
    "SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: users.email\nINSERT INTO users (email) VALUES (?);",
  );
  await page
    .locator(".ls-answer-tools")
    .getByRole("button", { name: /Inspect \d+ sources/ })
    .click();
  await page.getByRole("tab", { name: "Report", exact: true }).click();
  await expect(page.locator(".ls-report-detail")).toContainText(/SQLite|constraint|unique/i);
});

test("a built-in greeting stays honest and persists without inventing a failure", async ({
  page,
}) => {
  await page.goto("/");
  await send(page, "hi");
  const answer = page.locator(".ls-assistant-turn").last();
  await expect(answer).toContainText("Hi! I'm Lockstep");
  await expect(answer).toContainText(
    "This is a built-in reply; a live AI model did not generate it.",
  );
  await expect(answer.locator(".ls-answer-mode")).toHaveText("Deterministic guidance");
  await expect(answer).not.toContainText("The submitted excerpt does not identify");
  const content = await answer.locator(".ls-rich-text").first().textContent();
  const url = page.url();
  await page.reload();
  await expect(page.locator(".ls-assistant-turn")).toHaveCount(1);
  await expect(page.locator(".ls-assistant-turn .ls-rich-text").first()).toHaveText(content!);
  expect(page.url()).toBe(url);
  await page
    .locator(".ls-answer-tools")
    .getByRole("button", { name: "Structured report", exact: true })
    .click();
  await expect(page.locator(".ls-report-detail")).toContainText(
    "There is not enough evidence to establish a likely cause.",
  );
});
