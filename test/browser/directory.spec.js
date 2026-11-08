import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const catalog = JSON.parse(
  await readFile(new URL("../../data/rooms.json", import.meta.url), "utf8"),
);
async function mockApi(page, rooms = [], offline = false) {
  await page.route("**/api/rooms*", (route) =>
    route.fulfill({
      status: offline ? 503 : 200,
      json: { rooms, stale_after_seconds: 60 },
    }),
  );
  await page.route("**/api/readings?*", (route) =>
    route.fulfill({ json: { readings: [] } }),
  );
}

test("all listed spaces share search, saving and details even offline", async ({
  page,
}) => {
  await mockApi(page, [], true);
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(12);
  await page.getByRole("button", { name: /Show more spaces/ }).click();
  await expect(page.getByRole("article")).toHaveCount(24);
  await page
    .getByRole("combobox", { name: "Building", exact: true })
    .selectOption("Hennings Building");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("searchbox").fill("foyer");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("Capacity unknown");
  await page
    .getByRole("button", { name: "Save HENN - Foyer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View HENN - Foyer", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("link", { name: /UBC room page/ }),
  ).toHaveAttribute(
    "href",
    "https://learningspaces.ubc.ca/classrooms/henn-foyer",
  );
  await expect(
    dialog.getByRole("link", { name: /Directions/ }),
  ).toHaveAttribute("href", /google.com\/maps\/dir/);
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox").fill("nothing matches");
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await page
    .getByRole("button", { name: "Saved spaces (1)", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("HENN - Foyer");
});

test("an API reading enriches a catalog record without duplication and retains its sensor ID", async ({
  page,
}) => {
  const metadata = catalog[0];
  await mockApi(page, [
    {
      ...metadata,
      room_id: "sensor-room",
      source_url: `${metadata.source_url}/`,
      location: { building: metadata.building },
      latest_reading: {
        measured_at: new Date().toISOString(),
        people_count: 1,
        noise_level: 0.1,
        noise_unit: "relative",
      },
    },
  ]);
  await page.goto("/");
  await expect(
    page.getByText("1 of 68 listed spaces have recent readings."),
  ).toBeVisible();
  await expect(page.getByRole("article").first()).toContainText(metadata.name);
  await page.getByRole("searchbox").fill(metadata.name);
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: `View ${metadata.name}`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /Directions/ }),
  ).toBeVisible();
});

test("shared search retains building aliases, typo tolerance and address matching", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  for (const query of ["sauder", "saudre", "business sauder"]) {
    await page.getByRole("searchbox").fill(query);
    await expect(page.getByRole("article")).toHaveCount(2);
    await expect(page.getByRole("article").first()).toContainText("ANGU");
  }
  await page
    .getByRole("combobox", { name: "Building", exact: true })
    .selectOption("Allard Hall");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await page.getByRole("searchbox").fill("atrim");
  await expect(page.getByRole("article")).toHaveCount(7);
  await page.getByRole("searchbox").fill("1822 East Mall");
  await expect(page.getByRole("article")).toHaveCount(5);
});

test("local UBC photos load and the first room is reachable on phone and desktop", async ({
  page,
}, testInfo) => {
  await mockApi(page);
  await page.goto("/");
  const firstTitle = page.getByRole("article").first().getByRole("heading");
  await expect(firstTitle).toBeInViewport();
  const photo = page.getByRole("img").first();
  await expect(photo).toHaveAttribute("src", /^\/images\/study-spaces\//);
  await expect
    .poll(() => photo.evaluate((image) => image.naturalWidth))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("live-directory.png") });
});
