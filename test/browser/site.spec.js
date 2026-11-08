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

const card = (page, name) =>
  page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
const filter = (page, name) =>
  page
    .getByRole("group", { name: "Filter spaces" })
    .getByRole("button", { name });

test("SensoryAtlas opens in the directory with recent metrics and accessible details", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockRooms(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/SensoryAtlas/);
  await expect(
    page.getByRole("heading", { name: "Find a quiet spot at UBC." }),
  ).toBeVisible();
  await expect(page.getByRole("article").first()).toContainText("Group Studio");
  await expect(card(page, "Reading Room")).toContainText("About 9 seats free");
  await expect(card(page, "Reading Room")).toContainText("Quiet");
  await expect(
    page.getByText("2 of 71 listed spaces have recent readings."),
  ).toBeVisible();
  const open = card(page, "Reading Room").getByRole("button", {
    name: "View Reading Room",
  });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Reading Room" });
  await expect(
    dialog.getByRole("img", { name: /People count over time, 2 readings/ }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("search, quick filters, buildings and clear actions narrow the same directory", async ({
  page,
}) => {
  await mockRooms(page);
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search study spaces" });
  await search.fill("studio");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await filter(page, /Seats available/).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await filter(page, /Quiet/).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Building", exact: true })
    .selectOption("Test Student Hub");
  await expect(
    page.getByRole("heading", { name: "No spaces match just yet." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.getByRole("article")).toHaveCount(12);
  await noOverflow(page);
});

test("live and demo saves persist independently and demo deep links work", async ({
  page,
}) => {
  await mockRooms(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save Reading Room", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved spaces (1)", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Demo mode", exact: true }).click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Saved spaces", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save The Reading Room", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unsave The Reading Room", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View The Reading Room", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Demo mode · fictional sample data",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Return to live mode", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Saved spaces (1)", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("Reading Room");
});

test("failed initial load retains the public directory and retry recovers", async ({
  page,
}) => {
  let healthy = false;
  await page.route("**/api/rooms*", (route) =>
    healthy
      ? route.fulfill({ json: { rooms: rooms() } })
      : route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t load study spaces",
  );
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(page.getByRole("article").first()).toContainText(
    "No live readings",
  );
  healthy = true;
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByText("2 of 71 listed spaces have recent readings."),
  ).toBeVisible();
});

test("zero counts, missing metrics, unknown capacity and over-capacity readings stay distinct", async ({
  page,
}) => {
  const [base] = rooms();
  await mockRooms(page, [
    {
      ...base,
      name: "Zero Room",
      room_id: "zero",
      latest_reading: {
        ...base.latest_reading,
        people_count: 0,
        noise_level: 0,
      },
    },
    { ...base, name: "Unknown Room", room_id: "unknown", total_capacity: null },
    {
      ...base,
      name: "Over Room",
      room_id: "over",
      latest_reading: {
        ...base.latest_reading,
        people_count: 15,
        noise_level: 42,
        noise_unit: "dBA",
      },
    },
    {
      ...base,
      name: "Noise Only",
      room_id: "noise",
      latest_reading: { ...base.latest_reading, people_count: null },
    },
    {
      ...base,
      name: "Count Only",
      room_id: "count",
      latest_reading: { ...base.latest_reading, noise_level: null },
    },
  ]);
  await page.goto("/");
  await expect(card(page, "Zero Room")).toContainText("About 12 seats free");
  await expect(card(page, "Zero Room")).toContainText(
    "About 0 people measured",
  );
  await expect(card(page, "Unknown Room")).toContainText("About 3 people");
  await expect(card(page, "Unknown Room")).toContainText("Capacity unknown");
  await expect(card(page, "Over Room")).toContainText("About 0 seats free");
  await expect(card(page, "Over Room")).toContainText(
    "About 15 people measured",
  );
  await expect(card(page, "Over Room")).toContainText("42 dBA");
  await expect(card(page, "Noise Only")).toContainText("Occupancy unavailable");
  await expect(card(page, "Count Only")).toContainText("Noise unavailable");
  await page
    .getByRole("combobox", { name: "Sort spaces" })
    .selectOption("seats");
  await expect(page.getByRole("article").first()).toContainText("Zero Room");
  await filter(page, /Seats available/).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await noOverflow(page);
});

test("failed refresh retains outdated readings and recovers in an open detail", async ({
  page,
}) => {
  await page.clock.install();
  let healthy = true;
  const data = [rooms()[0]];
  await page.route("**/api/rooms*", (route) =>
    healthy
      ? route.fulfill({ json: { rooms: data, stale_after_seconds: 60 } })
      : route.fulfill({ status: 503, json: {} }),
  );
  await page.route("**/api/readings?*", (route) =>
    route.fulfill({ json: { readings: [] } }),
  );
  await page.goto("/");
  await page.getByRole("searchbox").fill("Reading Room");
  await page.getByRole("button", { name: "View Reading Room" }).click();
  healthy = false;
  await page.clock.fastForward(71000);
  await expect(page.getByRole("dialog")).toContainText("Outdated reading");
  await expect(page.getByRole("dialog")).toContainText("Last people count · outdated");
  await expect(page.getByRole("dialog")).toContainText("Last sound band · outdated");
  await expect(page.getByRole("dialog")).toContainText("Quiet");
  await page.keyboard.press("Escape");
  await expect(card(page, "Reading Room")).toContainText("Last measured");
  await expect(card(page, "Reading Room")).toContainText("About 3 people");
  await expect(card(page, "Reading Room")).toContainText("Last noise level · outdated");
  await expect(page.getByRole("alert")).toContainText("Couldn’t refresh");
  await filter(page, /Quiet/).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  healthy = true;
  data[0].latest_reading = {
    ...data[0].latest_reading,
    measured_at: await page.evaluate(() => new Date().toISOString()),
    noise_level: 0.8,
  };
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await filter(page, /All/).click();
  await page.getByRole("button", { name: "View Reading Room" }).click();
  await expect(page.getByRole("dialog")).toContainText("Lively");
  await expect(page.getByRole("dialog")).not.toContainText("outdated");
  data[0].latest_reading = { ...data[0].latest_reading, noise_level: 0.1 };
  await page.clock.fastForward(11000);
  await expect(page.getByRole("dialog")).toContainText("Quiet");
});

test('saved outdated sensor readings remain visible after reloading', async ({ page }) => {
  const room = rooms()[0];
  room.stale = true;
  room.latest_reading.measured_at = new Date(Date.now() - 86400000).toISOString();
  room.latest_reading.people_count = 0;
  await mockRooms(page, [room]);
  await page.goto('/');
  await page.reload();
  await page.getByRole('searchbox').fill('Reading Room');
  const result = card(page, 'Reading Room');
  await expect(result).toContainText('Outdated reading');
  await expect(result).toContainText('About 0 people');
  await expect(result).toContainText('Quiet');
  await expect(result).toContainText('Last measured');
  await expect(result).not.toContainText('seats free');
  await result.getByRole('button', { name: 'View Reading Room' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Last people count · outdated').locator('..')).toContainText('0');
  await expect(dialog).toContainText('Last sound band · outdated');
  await page.keyboard.press('Escape');
  await filter(page, /Seats available/).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await filter(page, /Quiet/).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await noOverflow(page);
});

test("history errors recover locally and empty history leaves room details usable", async ({
  page,
}) => {
  await mockRooms(page);
  let failed = true;
  await page.route("**/api/readings?*", (route) =>
    failed
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { readings: [] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "View Reading Room" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Occupancy history couldn’t be loaded.");
  failed = false;
  await dialog.getByRole("button", { name: /Try again/ }).click();
  await expect(dialog).toContainText("No occupancy history yet.");
  await expect(
    dialog.getByRole("button", { name: /Save this space/ }),
  ).toBeVisible();
});

test("live, demo and details pass accessibility checks and render at increased zoom", async ({
  page,
}, testInfo) => {
  await mockRooms(page);
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(12);
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
  await page.getByRole("button", { name: "Demo mode", exact: true }).click();
  await check();
  await page.screenshot({
    path: testInfo.outputPath("directory.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "View The Reading Room" }).click();
  await check();
  await page.screenshot({ path: testInfo.outputPath("details.png") });
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.documentElement.style.zoom = "2"));
  await noOverflow(page);
});

test("loading and timed out requests stay distinct from demo mode", async ({
  page,
}) => {
  await page.clock.install();
  let healthy = false;
  await page.route("**/api/rooms*", (route) => {
    if (healthy) return route.fulfill({ json: { rooms: [] } });
  });
  await page.goto("/");
  await expect(page.getByLabel("Loading spaces")).toBeVisible();
  await page.clock.fastForward(13000);
  await expect(page.getByRole("alert")).toBeVisible();
  healthy = true;
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(page.getByRole("status")).toContainText("Connected");
  await expect(
    page.getByText("0 of 68 listed spaces have recent readings."),
  ).toBeVisible();
  await expect(page.getByRole("article").first()).toContainText(
    "No live readings",
  );
});
