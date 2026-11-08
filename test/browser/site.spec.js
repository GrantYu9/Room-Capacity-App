import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function rooms() {
  const reading = {
    device_id: "fixture",
    measured_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
    people_count: 3,
    noise_level: 0.12,
    noise_unit: "relative",
  };
  return [
    {
      room_id: "reading",
      name: "Reading Room",
      total_capacity: 12,
      stale: false,
      source_url: null,
      location: { building: "Test Learning Centre", room_number: "201" },
      latest_reading: reading,
    },
    {
      room_id: "studio",
      name: "Group Studio",
      total_capacity: 10,
      stale: false,
      source_url: null,
      location: { building: "Test Student Hub", room_number: "101" },
      latest_reading: { ...reading, people_count: 10, noise_level: 0.8 },
    },
    {
      room_id: "pending",
      name: "Pending Room",
      total_capacity: null,
      stale: true,
      source_url: null,
      location: { building: null, room_number: null },
      latest_reading: null,
    },
  ];
}

async function mockRooms(page, data = rooms()) {
  await page.route("**/api/rooms*", (route) =>
    route.fulfill({ json: { rooms: data, stale_after_seconds: 60 } }),
  );
  await page.route("**/api/readings?*", (route) =>
    route.fulfill({
      json: {
        readings: [
          {
            measured_at: new Date(Date.now() - 60000).toISOString(),
            people_count: 2,
          },
          { measured_at: new Date().toISOString(), people_count: 3 },
        ],
      },
    }),
  );
}

async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("live spaces show current data, preserve unknown metadata and open activity", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockRooms(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find a quieter place to study" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  const reading = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Reading Room", exact: true }),
  });
  await expect(reading.getByText("9 seats")).toBeVisible();
  const pending = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Pending Room", exact: true }),
  });
  await expect(pending.getByText("Location not listed yet")).toBeVisible();
  await expect(pending.getByText("Awaiting a reading")).toBeVisible();
  await reading.getByRole("button", { name: "View Reading Room" }).click();
  const dialog = page.getByRole("dialog", { name: "Reading Room" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: /People count over time, 2 readings/ }),
  ).toBeVisible();
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("search, availability, quiet and building filters work together", async ({
  page,
}) => {
  await mockRooms(page);
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page
    .getByRole("searchbox", { name: "Search study spaces" })
    .fill("studio");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Group Studio", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  const filters = page.getByRole("group", { name: "Filter spaces" });
  await filters.getByRole("button", { name: /Space available/ }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Reading Room", exact: true }),
  ).toBeVisible();
  await filters.getByRole("button", { name: /Quiet spaces/ }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Building", exact: true })
    .selectOption("Test Student Hub");
  await expect(
    page.getByRole("heading", { name: "No spaces match just yet." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Show all spaces/ }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await noOverflow(page);
});

test("saved spaces persist after reloading", async ({ page }) => {
  await mockRooms(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save Reading Room", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved spaces (1)", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Saved spaces (1)", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Unsave Reading Room", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("sample view is explicit, fictional and does not inflate live favourites", async ({
  page,
}) => {
  await mockRooms(page, [rooms()[2]]);
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: /Explore sample spaces/ }).click();
  await expect(
    page.getByText("These rooms and readings are fictional examples.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Save The Reading Room", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved spaces (1)", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back to monitored rooms/ }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Saved spaces", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Reading Room", exact: true }),
  ).toHaveCount(0);
});

test("a failed API request shows an error and retry recovers without demo fallback", async ({
  page,
}) => {
  let healthy = false;
  await page.route("**/api/rooms*", (route) =>
    healthy
      ? route.fulfill({ json: { rooms: rooms() } })
      : route.fulfill({
          status: 503,
          json: { error: "Database temporarily unavailable." },
        }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "We couldn’t load monitored spaces",
  );
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByText("fictional examples", { exact: false }),
  ).toHaveCount(0);
  healthy = true;
  await page.getByRole("button", { name: "Retry", exact: false }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a stalled request times out and can be retried", async ({ page }) => {
  await page.clock.install();
  let healthy = false;
  await page.route("**/api/rooms*", (route) => {
    if (healthy) return route.fulfill({ json: { rooms: rooms() } });
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Connecting");
  await page.clock.fastForward(13000);
  await expect(page.getByRole("alert")).toBeVisible();
  healthy = true;
  await page.getByRole("button", { name: "Retry", exact: false }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
});

test("outdated readings are excluded from current occupancy and available filters", async ({
  page,
}) => {
  const data = rooms();
  data[0].latest_reading.measured_at = new Date(
    Date.now() - 120000,
  ).toISOString();
  await mockRooms(page, [data[0]]);
  await page.goto("/");
  await expect(
    page.getByRole("article").getByText("Reading delayed"),
  ).toBeVisible();
  await expect(
    page.getByRole("article").getByText("Showing no current occupancy"),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Filter spaces" })
    .getByRole("button", { name: /Space available/ })
    .click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("help dialog and sample layout work without horizontal overflow", async ({
  page,
}, testInfo) => {
  await mockRooms(page);
  await page.goto("/");
  await page.getByRole("button", { name: "How it works", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "How room works" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /Explore sample spaces/ }).click();
  await expect(page.getByRole("article")).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  await noOverflow(page);
  await page
    .getByRole("heading", { name: "Find a quieter place to study" })
    .scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: testInfo.outputPath(`room-${testInfo.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });
});

test("live, sample and detail views pass automated accessibility checks", async ({
  page,
}) => {
  await mockRooms(page);
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(3);
  async function check() {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          reason: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
  await check();
  await page.getByRole("button", { name: /Explore sample spaces/ }).click();
  await expect(page.getByRole("article")).toHaveCount(6);
  await check();
  await page
    .getByRole("button", { name: "View The Reading Room", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await check();
});

test("zero, unknown capacity and over-capacity readings stay distinct", async ({ page }) => {
  const [base] = rooms();
  const data = [
    { ...base, room_id: "zero", name: "Zero Room", latest_reading: { ...base.latest_reading, people_count: 0, noise_level: 0 } },
    { ...base, room_id: "unknown", name: "Unknown Room", total_capacity: null },
    { ...base, room_id: "over", name: "Over Room", latest_reading: { ...base.latest_reading, people_count: 15, noise_level: 42, noise_unit: "dBA" } },
  ];
  await mockRooms(page, data);
  await page.goto("/");
  const card = (name) => page.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card("Zero Room").getByText("No people detected")).toBeVisible();
  await expect(card("Zero Room").getByText("12 seats")).toBeVisible();
  await expect(card("Zero Room").getByText("0% relative sound level")).toBeVisible();
  await expect(card("Unknown Room").getByText("Capacity unknown · available seats unknown")).toBeVisible();
  await expect(card("Over Room").getByText("0 estimated seats available")).toBeVisible();
  await expect(card("Over Room").getByRole("progressbar")).toHaveAttribute("aria-valuenow", "15");
  await expect(card("Over Room").getByText("42 dBA")).toBeVisible();
  await page.getByRole("combobox", { name: "Sort spaces" }).selectOption("seats");
  await expect(page.getByRole("article").first()).toContainText("Zero Room");
  await page.getByRole("button", { name: "View Unknown Room" }).click();
  await expect(page.getByRole("dialog").getByText("Capacity unknown", { exact: true })).toBeVisible();
  await noOverflow(page);
});

test("reachable API without recent readings does not imply reporting sensors", async ({ page }) => {
  const data = rooms();
  data[0].latest_reading.measured_at = new Date(Date.now() - 120000).toISOString();
  await mockRooms(page, [data[0], data[2]]);
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("API reachable");
  const summary = page.getByRole("region", { name: "Study space summary" });
  await expect(summary).toContainText("0 of 2 rooms have recent readings");
  await expect(summary).toContainText("No recent readings");
  await page.getByRole("group", { name: "Filter spaces" }).getByRole("button", { name: /Quiet spaces/ }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("initial loading, empty API and offline sample preview are distinct", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/rooms*", async (route) => {
    await gate;
    await route.fulfill({ json: { rooms: [] } });
  });
  await page.goto("/");
  await expect(page.getByLabel("Loading spaces")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try sample preview", exact: true })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: "No monitored rooms yet." })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("API reachable");
  await page.unroute("**/api/rooms*");
  await page.route("**/api/rooms*", (route) => route.fulfill({ status: 503, json: {} }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Monitored spaces unavailable." })).toBeVisible();
  await page.getByRole("button", { name: "Try sample preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Study space summary" })).toContainText("Fictional sample data");
  await expect(page.getByRole("article").first()).toContainText("Fictional sample data");
  await page.getByRole("button", { name: "View The Reading Room", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Fictional sample data");
  await expect(page.getByRole("dialog")).toContainText("Last measured");
});

test("failed refresh retains its successful check time while cached readings age", async ({ page }) => {
  await page.clock.install();
  let healthy = true;
  let data = [rooms()[0]];
  await page.route("**/api/rooms*", (route) => healthy
    ? route.fulfill({ json: { rooms: data, stale_after_seconds: 60 } })
    : route.fulfill({ status: 503, json: {} }));
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(1);
  healthy = false;
  await page.clock.fastForward(11000);
  await expect(page.getByRole("alert")).toContainText("Last successful check:");
  await page.clock.fastForward(60000);
  await expect(page.getByRole("article")).toContainText("Reading delayed");
  await expect(page.getByRole("region", { name: "Study space summary" })).toContainText("0 of 1 rooms have recent readings");
  healthy = true;
  data[0].latest_reading.measured_at = await page.evaluate(() => new Date().toISOString());
  await page.getByRole("button", { name: "Retry", exact: false }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("article")).toContainText("Estimated seats available");
  await expect(page.getByRole("article")).not.toContainText("Fictional");
});

test("history empty and error states recover and dialog returns keyboard focus", async ({ page }) => {
  await mockRooms(page);
  let failed = true;
  await page.route("**/api/readings?*", (route) => failed
    ? route.fulfill({ status: 503, json: {} })
    : route.fulfill({ json: { readings: [] } }));
  await page.goto("/");
  const open = page.getByRole("button", { name: "View Reading Room", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Recent occupancy" })).toBeVisible();
  await expect(dialog).toContainText("Up to 100 recent readings");
  await expect(dialog).toContainText("Occupancy history couldn’t be loaded.");
  failed = false;
  await dialog.getByRole("button", { name: /Try again/ }).click();
  await expect(dialog).toContainText("No occupancy history yet.");
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.getByRole("button", { name: "How it works", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("roughly every 10 seconds");
  await expect(page.getByRole("dialog")).toContainText("Each measurement has its own timestamp");
});
