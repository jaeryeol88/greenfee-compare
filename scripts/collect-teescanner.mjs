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
const dates = Array.from({ length: 3 }, (_, i) => isoKst(new Date(now.getTime() + i * 86400000)));

const sourceByCourse = new Map();
for (const row of data.rows || []) {
  if (!row.teeUrl || !/golfclub_seq=\d+/.test(row.teeUrl)) continue;
  const match = row.teeUrl.match(/golfclub_seq=(\d+)/);
  if (match) sourceByCourse.set(row.course, match[1]);
}

let previous = [];
try {
  const old = await fs.readFile("public/public-prices.js", "utf8");
  const match = old.match(/window\.PUBLIC_PRICES\s*=\s*(\[[\s\S]*\]);?/);
  if (match) previous = JSON.parse(match[1]);
} catch {}

const tasks = [];
for (const [course, seq] of sourceByCourse) {
  for (const date of dates) {
    tasks.push({
      course, date,
      platform: "티스캐너",
      url: `https://www.teescanner.com/booking/detail?tab=booking&golfclub_seq=${seq}&roundDay=${date}&isJoin=N`
    });
  }
}

const browser = await chromium.launch({ headless: true });
const results = [];
let cursor = 0;

const worker = async () => {
  const page = await browser.newPage({ locale: "ko-KR" });
  while (cursor < tasks.length) {
    const item = tasks[cursor++];
    try {
      await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(1800);
      const extracted = await page.evaluate(({ expectedCourse }) => {
        const title = document.querySelector("strong")?.textContent?.trim() || "";
        const normalized = (value) => String(value || "")
          .replace(/컨트리클럽|골프클럽|CC/gi, "")
          .replace(/[^0-9A-Za-z가-힣]/g, "")
          .toLowerCase();
        if (!normalized(title).includes(normalized(expectedCourse)) && !normalized(expectedCourse).includes(normalized(title))) {
          return null;
        }
        const leafTexts = [...document.querySelectorAll("body *")]
          .filter((el) => el.children.length === 0)
          .map((el) => (el.textContent || "").trim())
          .filter(Boolean);
        const prices = [];
        for (const text of leafTexts) {
          if (/카트|캐디|식음|리뷰/.test(text)) continue;
          for (const match of text.matchAll(/(\d{2,3}(?:,\d{3})+)\s*원/g)) {
            const value = Number(match[1].replaceAll(",", ""));
            if (value >= 30000 && value <= 400000) prices.push(value);
          }
        }
        const body = document.body.innerText || "";
        const teams = [...body.matchAll(/(\d+)\s*팀/g)].map((m) => Number(m[1])).filter((n) => n > 0);
        if (!prices.length || !teams.length) return null;
        return { price: Math.min(...prices), teams: Math.max(...teams) };
      }, { expectedCourse: item.course });
      if (extracted) {
        results.push({
          ...item,
          price: extracted.price,
          teams: extracted.teams,
          checkedAt,
          benefits: [],
          evidence: "티스캐너 골프장·날짜 상세 예약 화면"
        });
      }
    } catch (error) {
      // Public page unavailable: keep the last verified value rather than guessing.
    }
  }
  await page.close();
};

await Promise.all(Array.from({ length: 4 }, worker));
await browser.close();

const keepAfter = dates[0];
const byKey = new Map(previous
  .filter((item) => item.platform === "티스캐너" && item.date >= keepAfter)
  .map((item) => [`${item.platform}|${item.date}|${normalize(item.course)}`, item]));
for (const item of results) {
  byKey.set(`${item.platform}|${item.date}|${normalize(item.course)}`, item);
}
const output = [...byKey.values()].sort((a, b) =>
  a.date.localeCompare(b.date) || a.course.localeCompare(b.course, "ko")
);
await fs.writeFile("public/public-prices.js", `window.PUBLIC_PRICES = ${JSON.stringify(output, null, 2)};\n`);
console.log(JSON.stringify({ checkedAt, tasks: tasks.length, verified: results.length, retained: output.length }));
