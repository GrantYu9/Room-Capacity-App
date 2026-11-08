import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile(new URL('../../data/rooms.json', import.meta.url), 'utf8'));

async function mockApi(page, rooms = [], offline = false) {
  await page.route('**/api/rooms*', route => route.fulfill({
    status: offline ? 503 : 200,
    json: { rooms, stale_after_seconds: 60 },
  }));
}

const directory = page => page.getByRole('region', { name: 'Unmonitored study spaces' });

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('unmonitored directory is browsable offline with published capacity and sources', async ({ page }) => {
  await mockApi(page, [], true);
  await page.goto('/');
  await page.getByRole('link', { name: 'Browse study spaces', exact: true }).click();
  const section = directory(page);
  await expect(section).toContainText('Showing 12 of 68 unmonitored study spaces');
  await expect(section).toContainText('Available seats unknown');
  await expect(page.getByRole('article')).toHaveCount(0);
  await section.getByRole('button', { name: 'Show more unmonitored spaces' }).click();
  await expect(section.getByRole('listitem')).toHaveCount(24);
  await section.getByRole('combobox', { name: 'Unmonitored building' }).selectOption('Hennings Building');
  await expect(section.getByRole('listitem')).toHaveCount(2);
  await section.getByRole('searchbox').fill('foyer');
  await expect(section.getByRole('listitem')).toHaveCount(1);
  await expect(section).toContainText('Capacity unknown');
  await expect(section.getByRole('link', { name: /View HENN - Foyer on UBC/ })).toHaveAttribute('href', 'https://learningspaces.ubc.ca/classrooms/henn-foyer');
  await section.getByRole('searchbox').fill('nothing matches');
  await expect(section.getByRole('heading', { name: 'No directory spaces match.' })).toBeVisible();
  await section.getByRole('button', { name: 'Clear directory filters' }).click();
  await expect(section.getByRole('listitem')).toHaveCount(12);
  await noOverflow(page);
});

test('catalog records without readings stay unmonitored and do not inflate current totals', async ({ page }) => {
  const metadata = catalog[0];
  await mockApi(page, [{ ...metadata, location: { building: metadata.building }, latest_reading: null }]);
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(directory(page)).toContainText('Showing 12 of 68');
  await expect(page.getByRole('region', { name: 'Study space summary' })).toContainText('0 of 0 rooms have recent readings');
  await expect(directory(page).getByRole('listitem').first()).toContainText('Published capacity: 100 seats');
});

test('API readings move matching spaces out of the directory and sample mode stays separate', async ({ page }) => {
  const metadata = catalog[0];
  await mockApi(page, [{ ...metadata, room_id: 'existing-room', source_url: `${metadata.source_url}/`, location: { building: metadata.building }, latest_reading: {
    measured_at: new Date().toISOString(), people_count: 1, noise_level: 0.1, noise_unit: 'relative',
  } }]);
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(directory(page)).toContainText('Showing 12 of 67');
  await directory(page).getByRole('searchbox').fill(metadata.name);
  await expect(directory(page).getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try sample preview', exact: true }).click();
  await expect(directory(page)).toHaveCount(0);
  await page.getByRole('button', { name: /Back to monitored rooms/ }).click();
  await expect(directory(page)).toBeVisible();
  await noOverflow(page);
});

test('UBC photos load locally and missing photos have a labelled placeholder', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.goto('/');
  const section = directory(page);
  await section.scrollIntoViewIfNeeded();
  const photo = section.getByRole('img').first();
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toHaveAttribute('src', /^\/images\/study-spaces\//);
  await expect.poll(() => photo.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await section.getByRole('searchbox').fill('MCLD');
  await expect(section.getByText('No photo published')).toBeVisible();
  await section.getByRole('searchbox').fill('ALRD');
  await expect(section.getByRole('listitem')).toHaveCount(5);
  await noOverflow(page);
  await section.getByRole('heading', { name: 'Unmonitored study spaces' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`directory-${testInfo.project.name}.png`) });
});

test('directory aliases and fuzzy search work with building filters', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const section = directory(page);
  const search = section.getByRole('searchbox');
  for (const query of ['sauder', 'saudre', 'business sauder']) {
    await search.fill(query);
    await expect(section.getByRole('listitem')).toHaveCount(2);
    for (const item of await section.getByRole('listitem').all()) {
      await expect(item).toContainText('ANGU');
    }
  }
  await section.getByRole('combobox', { name: 'Unmonitored building' }).selectOption('Allard Hall');
  await expect(section.getByRole('listitem')).toHaveCount(0);
  await section.getByRole('combobox', { name: 'Unmonitored building' }).selectOption('all');
  for (const query of ['atrium', 'atrim']) {
    await search.fill(query);
    await expect(section.getByRole('listitem')).toHaveCount(7);
    for (const item of await section.getByRole('listitem').all()) {
      await expect(item).toContainText(/Atrium/);
    }
  }
  await search.fill('cafe');
  await expect(section.getByRole('listitem')).toHaveCount(catalog.filter(room => /café/i.test(room.name)).length);
  await noOverflow(page);
});

test('monitored rooms share alias search while keeping availability and quiet filters', async ({ page }) => {
  const rooms = catalog.filter(room => room.building === 'Henry Angus Building').map((room, index) => ({
    ...room,
    location: { building: room.building, room_number: room.room_number, address: room.address },
    latest_reading: { measured_at: new Date().toISOString(), people_count: index ? room.total_capacity : 2, noise_level: index ? 0.8 : 0.1, noise_unit: 'relative' },
  }));
  await mockApi(page, rooms);
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search study spaces', exact: true });
  await search.fill('saudre');
  await expect(page.getByRole('article')).toHaveCount(2);
  const filters = page.getByRole('group', { name: 'Filter spaces' });
  await filters.getByRole('button', { name: /Space available/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await filters.getByRole('button', { name: /Quiet spaces/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await search.fill('no matching place');
  await expect(page.getByRole('article')).toHaveCount(0);
});
