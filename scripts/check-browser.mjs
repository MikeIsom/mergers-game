import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const base = process.env.ACQUIRE_TEST_URL ?? "http://127.0.0.1:5191";
const server = process.env.ACQUIRE_TEST_URL
	? undefined
	: spawn(
			"pnpm",
			["--filter", "acquire-viewer", "exec", "vite", "--host", "127.0.0.1", "--port", "5191", "--strictPort"],
			{
				stdio: "pipe",
				detached: process.platform !== "win32",
			}
		);
let serverOutput = "";
server?.stdout.on("data", (data) => (serverOutput += data));
server?.stderr.on("data", (data) => (serverOutput += data));
let browser;
const errors = [];
const locales = [
	"en",
	"de",
	"fr",
	"pl",
	"ro",
	"el",
	"hi",
	"ru",
	"da",
	"pt-BR",
	"ko",
	"zh-TW",
	"zh-CN",
	"vi",
	"it",
	"nl",
	"fa",
];
const output = new URL("../release/qa/", import.meta.url);
await mkdir(output, { recursive: true });
const report = { layouts: [], diagnostics: null, scenarios: [] };

try {
	for (let attempt = 0; ; attempt++) {
		if (server && server.exitCode !== null) {
			throw new Error(serverOutput);
		}
		if (
			await fetch(base)
				.then((r) => r.ok)
				.catch(() => false)
		) {
			break;
		}
		if (attempt >= 100) {
			throw new Error(`Dev server did not start: ${serverOutput}`);
		}
		await delay(100);
	}
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
	page.on("pageerror", (error) => errors.push(error.message));
	const settle = async () =>
		page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const open = async (params = "") => {
		await page.goto(`${base}/?bundle=1&seed=bgs&bar=0&${params}`);
		await page.waitForSelector("main .board");
		await settle();
	};
	const preferences = async (value) => {
		await page.evaluate((prefs) => window.acquireDev.emitter.emit("preferences", prefs), value);
		await settle();
	};
	await open("players=4&moves=50&merger=1&theme=light");
	report.diagnostics = await page.evaluate(() => window.acquireDev.viewer.diagnostics(["core", "chat", "replay"]));
	assert.equal(report.diagnostics.compatible, true);
	assert.equal(report.diagnostics.recommended.percent, 100);

	for (const [width, height] of [
		[1280, 900],
		[390, 844],
		[320, 700],
		[844, 390],
	]) {
		await page.setViewportSize({ width, height });
		for (const locale of locales) {
			await preferences({ locale, colorBlind: true });
			assert.equal(await page.locator("main").getAttribute("lang"), locale);
			assert.equal(await page.locator("main").getAttribute("dir"), locale === "fa" ? "rtl" : "ltr");
			const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
			assert.ok(scrollWidth <= width + 1, `${locale} ${width}px: page overflow ${scrollWidth}`);
			assert.ok((await page.locator(".player .symbol").count()) >= 4, "default color-blind player symbols");
			report.layouts.push({ width, height, locale, scrollWidth });
		}
	}
	report.scenarios.push("17 live languages at four viewport sizes, touch controls, RTL and default player symbols");

	await page.setViewportSize({ width: 390, height: 844 });
	await preferences({ locale: "fr", colorBlind: true });
	await page.evaluate(() => window.acquireDev.emitter.emit("chat:state", { canSend: false, reason: "not-a-player" }));
	await settle();
	assert.match(await page.locator(".chat-status").innerText(), /Seuls les joueurs/);
	await preferences({ locale: "de", colorBlind: true });
	assert.match(await page.locator(".chat-status").innerText(), /Nur Spieler/);
	await page.evaluate(() => window.acquireDev.emitter.emit("chat:state", { canSend: true }));
	await preferences({ locale: "en" });
	await page.locator(".chat-composer input").fill("Private beta smoke test");
	await page.locator(".chat-composer button").click();
	await page.waitForFunction(() =>
		document.querySelector(".chat-messages")?.textContent.includes("Private beta smoke test")
	);
	await preferences({ locale: "en", analysis: true });
	assert.equal(await page.locator(".chat").count(), 0);
	await preferences({ locale: "en", analysis: false });
	assert.equal(await page.locator(".chat").count(), 1);
	report.scenarios.push("chat send acknowledgement, localized permissions, live language change, analysis hides chat");

	for (const mode of ["players=6", "players=2&twoPlayerMode=fourHands"]) {
		await open(`${mode}&moves=35&hotseat=0&view=0`);
		const count = mode.startsWith("players=6") ? 6 : 2;
		for (let player = 0; player <= count; player++) {
			const view = player === count ? null : player;
			await page.evaluate((viewer) => {
				const dev = window.acquireDev;
				const index = viewer ?? undefined;
				dev.emitter.emit("player", { index });
				dev.emitter.emit("state", dev.engine.stripSecret(structuredClone(dev.state), index));
			}, view);
			await settle();
			const hands = view === null ? 0 : count === 2 ? 2 : 1;
			assert.equal(await page.locator("section.hand").count(), hands);
			const liveBoard = await page.locator("main .board").first().innerText();
			await page.evaluate(() => {
				const emitter = window.acquireDev.emitter;
				emitter.emit("replay:start");
				emitter.emit("replay:to", 0);
			});
			await settle();
			assert.equal(await page.locator("section.hand").count(), 0);
			assert.equal(await page.locator(".panel button").count(), 0);
			assert.notEqual(await page.locator("main .board").first().innerText(), liveBoard);
			await page.evaluate(() => window.acquireDev.emitter.emit("replay:end"));
			await settle();
			assert.equal(await page.locator("main .board").first().innerText(), liveBoard);
			assert.equal(await page.locator("section.hand").count(), hands);
		}
	}
	report.scenarios.push("every six-player and four-hands seat plus spectators: replay navigation and live return");

	await open("players=4&theme=light");
	const before = await page.evaluate(() => window.acquireDev.state.log.length);
	await page.locator("section.hand button").first().click();
	await page
		.locator(".panel")
		.getByRole("button", { name: /^Place / })
		.click();
	await page.waitForFunction((length) => window.acquireDev.state.log.length > length, before);
	await settle();
	assert.equal(await page.getByText("Sending…", { exact: true }).count(), 0);
	const after = await page.locator("main .board").first().innerText();
	await page.evaluate(() => window.acquireDev.emitter.emit("state:updated"));
	await settle();
	assert.equal(await page.locator("main .board").first().innerText(), after);
	report.scenarios.push("real tile move through the built viewer and state refresh");

	for (const [name, params, width, height] of [
		["overview", "players=4&moves=95&publicHoldings=1", 1280, 900],
		["merger", "players=4&moves=50&merger=1&publicHoldings=1", 1280, 900],
		["phone", "players=4&moves=50&merger=1&publicHoldings=1", 390, 844],
	]) {
		await page.setViewportSize({ width, height });
		for (const theme of ["light", "dark"]) {
			await open(`${params}&theme=${theme}`);
			await page.screenshot({ path: new URL(`${name}-${theme}.png`, output).pathname, fullPage: true });
		}
	}
	await preferences({ locale: "fa", colorBlind: true });
	await page.screenshot({ path: new URL("phone-fa.png", output).pathname, fullPage: true });
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 900 });
		for (const chapter of ["founding", "mergers", "scoring"]) {
			await page.evaluate((id) => localStorage.removeItem(`bgs:tutorial:acquire:${id}`), chapter);
			await page.goto(`${base}/?bundle=1&tutorial=${chapter}&locale=en`);
			await page.waitForSelector('.acquire-tutorial[data-step="0"]');
			assert.equal(await page.locator(".chat").count(), 0);
			const place = async (tile) => {
				await page.locator("section.hand").getByRole("button", { name: tile, exact: true }).click();
				await page
					.locator(".panel")
					.getByRole("button", { name: `Place ${tile}`, exact: true })
					.click();
			};
			if (chapter === "scoring") {
				await page.getByRole("button", { name: "Announce the end…", exact: true }).click();
				await page.getByRole("button", { name: "Announce the end", exact: true }).click();
			} else {
				await place(chapter === "founding" ? "2A" : "4A");
			}
			await page.waitForSelector('.acquire-tutorial[data-step="1"]');
			await page.reload();
			await page.waitForSelector('.acquire-tutorial[data-step="1"]');
			await page.getByRole("button", { name: "Retry step", exact: true }).click();
			if (chapter === "founding") {
				await page.locator(".choices button").filter({ hasText: "Luxor" }).click();
				await page.getByRole("alert").waitFor();
				await page.locator(".choices button").filter({ hasText: "Tower" }).click();
			} else if (chapter === "mergers") {
				await page.getByRole("button", { name: "Sell one more", exact: true }).click();
				await page.getByRole("button", { name: "Trade two more", exact: true }).click();
				await page.locator("main .panel button.primary").click();
			} else {
				await place("12A");
			}
			await page.waitForSelector('.acquire-tutorial[data-step="2"]');
			if (chapter === "founding") {
				await page.getByRole("button", { name: "Buy one more Tower", exact: true }).click();
				await page.getByRole("button", { name: "Buy one more Tower", exact: true }).click();
			}
			await page.locator("main .panel button.primary").click();
			await page.waitForSelector('.acquire-tutorial[data-completed="true"]');
			if (chapter === "scoring") {
				assert.match(await page.locator(".results").innerText(), /15,800/);
			}
			for (const locale of ["fr", "fa"]) {
				await page.evaluate(async ({ chapter, locale }) => window.acquire.launchTutorial("#app", { chapter, locale }), {
					chapter,
					locale,
				});
				await page.waitForSelector('.acquire-tutorial[data-completed="true"]');
				assert.equal(await page.locator(".acquire-tutorial").getAttribute("lang"), locale);
				assert.equal(await page.locator("main").getAttribute("dir"), locale === "fa" ? "rtl" : "ltr");
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
					`${chapter} ${locale} tutorial overflow`
				);
			}
			await page.screenshot({ path: new URL(`tutorial-${chapter}-${width}.png`, output).pathname, fullPage: true });
		}
	}
	report.scenarios.push(
		"three tutorials completed through real controls on desktop and phone; reload, retry, rejected move, French/Persian resume and final scoring"
	);

	await page.evaluate(() => window.acquire.destroy());
	await settle();
	assert.equal(await page.locator("main").count(), 0);
	assert.deepEqual(errors, []);
	report.scenarios.push("light/dark production-bundle screenshots and clean viewer teardown");
	await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2) + "\n");
	console.log(
		`Browser checks passed: ${report.layouts.length} locale/viewport combinations; ${report.scenarios.length} integration scenarios.`
	);
} finally {
	await browser?.close();
	if (server?.pid) {
		if (process.platform === "win32") {
			server.kill();
		} else {
			process.kill(-server.pid, "SIGTERM");
		}
	}
}
