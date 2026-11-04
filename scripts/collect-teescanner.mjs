import fs from "node:fs/promises";
import vm from "node:vm";
import { chromium } from "playwright";

const KST = "Asia/Seoul";
const now = new Date();
const checkedAt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: KST, dateStyle: "short", timeStyle: "medium"
}).format(now).replace(" ", "T");
const isoKst = (d) => new Intl.DateTimeFormat("en-CA", {
  timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit"
}).format(d);
const normalize = (value = "") => String(value)
  .replace(/\((?:구\.?\s*[^)]*)\)/g, "")
  .replace(/컨트리클럽|골프클럽|CC/gi, "")
  .replace(/[^0-9A-Za-z가-힣]/g, "")
  .toLowerCase();

const sandbox = { window: {} };
for (const file of [
  "public/data-core.js",
  "public/data-rows-1.js","public/data-rows-2.js","public/data-rows-3.js",
  "public/data-rows-4.js","public/data-rows-5.js","public/data-rows-6.js","public/data-rows-7.js"
]) {
  vm.runInNewContext(await fs.readFile(file, "utf8"), sandbox);
}
const data = sandbox.window.GOLF_DATA;
const today = isoKst(now);
const dates = (data.calendarDates || [])
  .map((item) => item.date)
  .filter((date) => date >= today && date <= "2026-12-31");

const preferredNames = new Map();
for (const course of data.courses || []) preferredNames.set(normalize(course), course);

let previous = [];
try {
  const old = await fs.readFile("public/public-prices.js", "utf8");
  const match = old.match(/window\.PUBLIC_PRICES\s*=\s*(\[[\s\S]*\]);?/);
  if (match) previous = JSON.parse(match[1]);
} catch {}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "ko-KR",
  timezoneId: KST,
  geolocation: { latitude: 35.1796, longitude: 129.0756 },
  permissions: ["geolocation"]
});
const results = [];
let cursor = 0;

const collectDate = async (page, date) => {
  const listUrl = `https://www.teescanner.com/booking/list?roundDay=${date}&tab=golfcourse`;
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  const enableLocation = page.getByRole("button", { name: "위치서비스 켜기", exact: true });
  if (await enableLocation.count()) {
    await enableLocation.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  const close = page.getByRole("button", { name: "닫기", exact: true });
  if (await close.count()) await close.first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(1300);

  let previousHeight = 0;
  for (let i = 0; i < 14; i += 1) {
    const height = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(350);
    if (height === previousHeight) break;
    previousHeight = height;
  }

  const offers = await page.evaluate(() => {
    const output = [];
    const seen = new Set();
    for (const strong of document.querySelectorAll("strong")) {
      const course = (strong.textContent || "").trim();
      if (!course) continue;
      let node = strong;
      let card = null;
      for (let depth = 0; depth < 9 && node; depth += 1, node = node.parentElement) {
        const text = node.innerText || "";
        const link = node.querySelector?.('a[href*="golfclub_seq="]');
        if (link && /\d{2,3}(?:,\d{3})+\s*원\s*~?/.test(text)) {
          card = node;
          break;
        }
      }
      if (!card) continue;
      const text = card.innerText || "";
      const priceMatch = text.match(/(\d{2,3}(?:,\d{3})+)\s*원\s*~?/);
      const link = card.querySelector('a[href*="golfclub_seq="]');
      const seq = link?.getAttribute("href")?.match(/golfclub_seq=(\d+)/)?.[1];
      if (!priceMatch || !seq) continue;
      const price = Number(priceMatch[1].replaceAll(",", ""));
      if (price < 30000 || price > 400000) continue;
      const teams = Math.max(0, ...[...text.matchAll(/(\d+)\s*팀/g)].map((m) => Number(m[1])));
      const key = course + "|" + seq;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({ course, seq, price, teams });
    }
    return output;
  });

  for (const offer of offers) {
    const course = preferredNames.get(normalize(offer.course));
    if (!course) continue;
    results.push({
      course,
      date,
      platform: "티스캐너",
      url: `https://www.teescanner.com/booking/detail?tab=booking&golfclub_seq=${offer.seq}&roundDay=${date}&isJoin=N`,
      price: offer.price,
      teams: offer.teams || null,
      checkedAt,
      benefits: [],
      evidence: "티스캐너 날짜별 골프장 목록 최저가"
    });
  }
};

const worker = async () => {
  const page = await context.newPage();
  while (cursor < dates.length) {
    const date = dates[cursor++];
    try { await collectDate(page, date); } catch {}
  }
  await page.close();
};

await Promise.all(Array.from({ length: 3 }, worker));
await context.close();
await browser.close();

const byKey = new Map(previous
  .filter((item) => item.platform === "티스캐너" && item.date >= today)
  .map((item) => [`${item.platform}|${item.date}|${normalize(item.course)}`, item]));
for (const item of results) {
  byKey.set(`${item.platform}|${item.date}|${normalize(item.course)}`, item);
}
const output = [...byKey.values()].sort((a, b) =>
  a.date.localeCompare(b.date) || a.course.localeCompare(b.course, "ko")
);
await fs.writeFile("public/public-prices.js", `window.PUBLIC_PRICES = ${JSON.stringify(output, null, 2)};\n`);
console.log(JSON.stringify({
  checkedAt,
  dates: dates.length,
  newlyVerified: results.length,
  retained: output.length
}));
