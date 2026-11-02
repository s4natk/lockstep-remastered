import { expect, test, type Page, type Locator } from "@playwright/test";

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page
    .locator(".investigation-app")
    .evaluate((element) => ({ scroll: element.scrollWidth, width: element.clientWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
}

async function assertTextContrast(locator: Locator) {
  const ratio = await locator.evaluate((element) => {
    const rgba = (value: string) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
    };
    const ancestors: Element[] = [];
    let node: Element | null = element;
    while (node) {
      ancestors.unshift(node);
      node = node.parentElement;
    }
    let background = [255, 255, 255];
    for (const ancestor of ancestors) {
      const color = rgba(getComputedStyle(ancestor).backgroundColor);
      background = background.map(
        (channel, index) => color[index]! * color[3]! + channel * (1 - color[3]!),
      );
    }
    const foreground = rgba(getComputedStyle(element).color);
    const luminance = (color: number[]) =>
      color
        .slice(0, 3)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

async function runExample(page: Page, id: string) {
  await page.goto(`/investigate?example=${id}`);
  await expect(page.getByLabel("Error, stack trace, logs, or SQL")).not.toBeEmpty();
  await page.getByRole("button", { name: "Investigate failure" }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer picture of the failure." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Observed evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verify the fix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Evidence inspector/ })).toBeVisible();
  await expect(page.locator(".notice-neutral strong")).toHaveText("Deterministic analysis");
}

test("landing, navigation, keyboard focus, desktop and mobile layout", async ({ page }, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Every error has a story. Find yours." }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.screenshot({ path: info.outputPath("landing-desktop.png"), fullPage: true });
  await assertNoHorizontalOverflow(page);
  await assertTextContrast(page.locator(".hero-description"));
  await assertTextContrast(page.getByRole("link", { name: "Start an investigation" }));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Start an investigation" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath("landing-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "Start an investigation" }).click();
  await expect(page.getByRole("heading", { name: "What went wrong?" })).toBeVisible();
  await assertTextContrast(page.locator('label[for="failure-input"]'));
  await assertTextContrast(page.locator("#failure-input"));
  await page.screenshot({ path: info.outputPath("intake-mobile.png"), fullPage: true });
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath("intake-tablet.png"), fullPage: true });
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
  test(`real ${id} investigation completes without provider credentials`, async ({
    page,
  }, info) => {
    await runExample(page, id);
    const citation = page.locator(".evidence-references button").first();
    await citation.click();
    await expect(page.locator(".evidence-content")).toBeFocused();
    if (id === "python") {
      await page.screenshot({ path: info.outputPath("report-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath("report-mobile.png"), fullPage: true });
    }
    await assertNoHorizontalOverflow(page);
  });
}

test("history persists across reload, keeps owners separate, and deletes saved reports", async ({
  page,
  browser,
}, info) => {
  await runExample(page, "python");
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.locator(".history-item")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".history-item")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("history-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath("history-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("http://localhost:3000/history");
  await expect(
    otherPage.getByRole("heading", { name: "Your first investigation starts here." }),
  ).toBeVisible();
  await other.close();
  await page.locator(".history-item-link").click();
  await expect(
    page.getByRole("heading", { name: "A clearer picture of the failure." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: /Delete investigation/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your first investigation starts here." }),
  ).toBeVisible();
});

test("empty, oversized, and malformed environment inputs give actionable validation", async ({
  page,
}) => {
  await page.goto("/investigate");
  await page.getByRole("button", { name: "Investigate failure" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("Paste an error");
  await page.getByLabel("Error, stack trace, logs, or SQL").fill("x".repeat(32769));
  await page.getByRole("button", { name: "Investigate failure" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("32768");
  await page.getByLabel("Error, stack trace, logs, or SQL").fill("TypeError: failed");
  await page.getByText("Environment details", { exact: false }).click();
  await page.getByLabel("Runtime, framework, or deployment context").fill("not-a-pair");
  await page.getByRole("button", { name: "Investigate failure" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("KEY=value");
});

test("network failure and unavailable saved sessions are recoverable", async ({ page }) => {
  await page.route("**/api/investigations", (route) => route.abort("failed"));
  await page.goto("/investigate?example=python");
  await page.getByRole("button", { name: "Investigate failure" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("Could not reach");
  await expect(page.getByRole("button", { name: "Investigate failure" })).toBeEnabled();
  await page.unroute("**/api/investigations");
  await page.goto("/investigate?id=missing-session");
  await expect(page.locator(".notice[role=alert]")).toContainText("unavailable or has expired");
});

test("malformed streamed output is rejected without rendering a broken report", async ({
  page,
}) => {
  await page.route("**/api/investigations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"type":"report","report":{"summary":"malformed"}}\n\ndata: {"type":"done"}\n\n',
    }),
  );
  await page.goto("/investigate?example=javascript");
  await page.getByRole("button", { name: "Investigate failure" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("report format");
  await expect(
    page.getByRole("heading", { name: "A clearer picture of the failure." }),
  ).toHaveCount(0);
});

test("slow request can be cancelled and edited before retry", async ({ page }) => {
  let releaseRequest = () => {};
  const delayed = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let requestCount = 0;
  await page.route("**/api/investigations", async (route) => {
    requestCount += 1;
    await delayed;
    await route.abort().catch(() => undefined);
  });
  await page.goto("/investigate?example=http");
  await page.getByRole("button", { name: "Investigate failure" }).click();
  await expect.poll(() => requestCount).toBe(1);
  await page.getByRole("button", { name: "Cancel investigation" }).click();
  releaseRequest();
  await expect(page.getByText("Investigation cancelled", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requestCount).toBe(1);
  await expect(page.getByLabel("Error, stack trace, logs, or SQL")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Investigate failure" })).toBeEnabled();
});

test("how-it-works and specialized SQL remain reachable", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByRole("heading", { name: "Reasoning you can inspect." })).toBeVisible();
  await page.getByRole("link", { name: "SQL review" }).click();
  await expect(page.getByText("Specialized PostgreSQL migration review")).toBeVisible();
  await expect(page.getByRole("link", { name: "Investigation workspace" })).toBeVisible();
});

test("specialized SQL review streams authenticated parser findings and a cited note", async ({
  page,
}, info) => {
  await page.goto("/sql");
  await expect(page.getByLabel("Migration SQL")).toBeVisible();
  await page
    .getByLabel("Migration SQL")
    .fill("DROP TABLE sessions;\nCREATE INDEX users_email_idx ON users (email);");
  const socketPromise = page.waitForEvent("websocket");
  await page.getByRole("button", { name: "Review", exact: true }).last().click();
  const socket = await socketPromise;
  expect(socket.url()).not.toContain("access_token");
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Data loss", { exact: false }).first()).toBeVisible();
  await page.getByRole("radio", { name: "Rollout", exact: false }).click();
  await expect(
    page.getByText(
      "Deterministic guidance based on parser findings and retrieved sources. AI drafting is unavailable.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy rollout note" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("sql-review-desktop.png"), fullPage: true });
});
