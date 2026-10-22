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
const report = { layouts: [], tutorialLayouts: [], gallery: [], diagnostics: null, scenarios: [] };

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

	for (const theme of ["light", "dark"]) {
		await page.setViewportSize({ width: 1920, height: 1280 });
		await open(`players=4&moves=95&publicHoldings=1&theme=${theme}`);
		const geometry = await page.evaluate(() => {
			const main = document.querySelector("main");
			const column = document.querySelector(".layout > .board");
			const frame = column.querySelector(".frame");
			return {
				margin: getComputedStyle(document.body).margin,
				page: getComputedStyle(main).backgroundColor,
				canvas: getComputedStyle(document.documentElement).backgroundColor,
				body: getComputedStyle(document.body).backgroundColor,
				left: main.getBoundingClientRect().left,
				right: main.getBoundingClientRect().right,
				board: frame.getBoundingClientRect().width,
				column: column.getBoundingClientRect().width,
			};
		});
		assert.equal(geometry.margin, "0px");
		assert.equal(geometry.canvas, geometry.page);
		assert.equal(geometry.body, geometry.page);
		assert.equal(geometry.left, 0);
		assert.equal(geometry.right, 1920);
		assert.ok(geometry.board > 750, "board uses the wide desktop column");
		assert.ok(Math.abs(geometry.board - geometry.column) < 1);
		assert.equal(await page.locator(".chat summary").isVisible(), false);
		assert.equal(await page.locator(".chat-composer").isVisible(), true);
		const logAppearance = await page.evaluate(() => {
			const colors = Object.fromEntries(
				[...document.querySelectorAll(".players .player-name")].map((name) => [
					name.textContent,
					getComputedStyle(name).color,
				])
			);
			return {
				playersMatch: [...document.querySelectorAll(".log .player-name")].every(
					(name) => getComputedStyle(name).color === colors[name.textContent]
				),
				chains: [
					...new Set([...document.querySelectorAll(".log .chain-name")].map((name) => getComputedStyle(name).color)),
				],
				money: [...document.querySelectorAll(".log .money")].map((amount) => ({
					text: amount.textContent,
					weight: getComputedStyle(amount).fontWeight,
					numbers: getComputedStyle(amount).fontVariantNumeric,
				})),
			};
		});
		assert.equal(logAppearance.playersMatch, true, "log player colors match the player table in each theme");
		assert.ok(logAppearance.chains.length >= 3, "chain names retain distinct colors in the log");
		assert.ok(logAppearance.money.length > 0);
		for (const amount of logAppearance.money) {
			assert.match(amount.text, /^\$/);
			assert.equal(amount.weight, "600");
			assert.equal(amount.numbers, "tabular-nums");
		}
		await page.screenshot({ path: new URL(`fullscreen-${theme}.png`, output).pathname });
	}
	report.scenarios.push("full-window theme background, no outer gutters, wider board and permanently visible chat");
	report.scenarios.push("consistent player colors, distinct chain names and emphasized cash in light/dark logs");

	await open("players=4&hotseat=0&view=0&theme=dark");
	const inspectHand = async (view) => {
		const expected = await page.evaluate((view) => {
			const dev = window.acquireDev;
			const player =
				view === "acting"
					? dev.engine.currentPlayer(dev.state)
					: view === "waiting"
						? (dev.engine.currentPlayer(dev.state) + 1) % 4
						: undefined;
			const state = dev.engine.stripSecret(structuredClone(dev.state), player);
			dev.emitter.emit("player", { index: player });
			dev.emitter.emit("state", state);
			return player === undefined
				? []
				: state.seats
						.flatMap((seat, index) =>
							state.seatOwner[index] === player
								? seat.hand.filter((tile) => tile !== dev.rules.HIDDEN).map(dev.rules.tileLabel)
								: []
						)
						.sort();
		}, view);
		await settle();
		assert.deepEqual((await page.locator(".square.held .coord").allTextContents()).sort(), expected);
	};
	await inspectHand("waiting");
	assert.equal(await page.locator(".square.playable").count(), 0, "waiting players cannot submit a tile");
	await inspectHand("spectator");
	await inspectHand("acting");
	await open("players=4&theme=dark");
	const beforeBoardMove = await page.evaluate(() => window.acquireDev.state.log.length);
	await page.locator(".square.playable").first().click();
	assert.equal(
		await page.evaluate(() => window.acquireDev.state.log.length),
		beforeBoardMove,
		"first click previews the move"
	);
	assert.equal(await page.locator(".square.selected").count(), 1);
	await page.locator(".square.selected").click();
	await page.waitForFunction((length) => window.acquireDev.state.log.length > length, beforeBoardMove);
	await page.evaluate(() => window.acquireDev.emitter.emit("replay:start"));
	await settle();
	assert.equal(
		await page.locator(".square.held").count(),
		0,
		"replay does not project the current hand onto old boards"
	);
	report.scenarios.push(
		"own hand visible while waiting, spectator privacy, board selection/confirmation and replay isolation"
	);

	await open("players=4&moves=95&theme=light");
	assert.equal(await page.locator(".chain .letter").count(), await page.locator(".square.chain").count());
	assert.equal(await page.locator(".pattern, .patterned").count(), 0);
	assert.equal(await page.locator(".player .symbol, .chat .player-symbol").count(), 0);
	const authorColors = await page
		.locator(".chat .player-name")
		.evaluateAll((names) => names.map((name) => getComputedStyle(name).color));
	assert.equal(new Set(authorColors).size, 2, "chat authors have distinct player colors");
	await page.locator(".chat-composer input").fill("Unsent draft");
	await preferences({
		locale: "en",
		colorBlind: true,
		bgs: {
			players: [{ pro: true }, { pro: true }, { pro: true }, { pro: false }],
			playerColors: ["#13b7c8", "#111111", "#ffffff", "#3aa35b"],
			playerSymbols: ["circle", "triangle", "square", "diamond"],
		},
	});
	assert.equal(
		await page.locator(".chat-composer input").inputValue(),
		"Unsent draft",
		"appearance updates preserve chat drafts"
	);
	assert.equal(
		await page.locator(".player .symbol, .chat .player-symbol").count(),
		0,
		"old BGS preferences do not restore redundant symbols"
	);
	const customAppearance = await page.evaluate(() => {
		const names = Object.fromEntries(
			[...document.querySelectorAll(".players .player-name")].map((name) => [
				name.textContent,
				getComputedStyle(name).color,
			])
		);
		return {
			markers: [...document.querySelectorAll(".players .color")].map((marker) => marker.style.background),
			matches: [...document.querySelectorAll(".log .player-name, .chat .player-name")].every(
				(name) => getComputedStyle(name).color === names[name.textContent]
			),
		};
	});
	assert.deepEqual(
		customAppearance.markers,
		["rgb(19, 183, 200)", "rgb(17, 17, 17)", "rgb(255, 255, 255)", "rgb(58, 163, 91)"],
		"BGS supporter colors take precedence over game defaults"
	);
	assert.equal(
		customAppearance.matches,
		true,
		"custom supporter colors update consistently in the table, chat and log"
	);
	await page.locator(".chat-composer input").fill("");
	report.scenarios.push(
		"always-visible chain letters, no redundant symbols, player colors and live appearance updates"
	);

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
			assert.equal(await page.locator(".player .symbol").count(), 0);
			report.layouts.push({ width, height, locale, scrollWidth });
		}
	}
	report.scenarios.push("17 live languages at four viewport sizes, touch controls and RTL");

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

	// The desktop used to stack every supporting panel in one tall sidebar. Check the rendered
	// arrangement and height, not only horizontal overflow, before creating gallery images.
	await page.setViewportSize({ width: 1280, height: 900 });
	await open("players=4&moves=95&publicHoldings=1");
	const board = await page.locator(".layout > .board").boundingBox();
	const panels = await Promise.all(
		[".players", ".history", ".conversation"].map((selector) => page.locator(`.layout > ${selector}`).boundingBox())
	);
	for (const panel of panels) {
		assert.ok(panel.y >= board.y + board.height, "supporting panels sit below the board");
		assert.ok(Math.abs(panel.y - panels[0].y) < 1, "supporting panels share a desktop row");
	}
	assert.ok((await page.locator("main").boundingBox()).height <= 900, "desktop game fits within 900px");
	assert.equal(await page.locator(".log li").count(), 8);
	await page.getByRole("button", { name: /^Show the whole log/ }).click();
	assert.ok((await page.locator(".log li").count()) > 100, "full history remains available");
	await page.locator(".history button").click();
	assert.equal(await page.locator(".log li").count(), 8);
	report.scenarios.push("balanced desktop panels, compact recent history and expandable full log");

	for (const [name, params, width, height] of [
		["overview", "players=4&moves=95&publicHoldings=1", 1280, 900],
		["merger", "players=4&moves=50&merger=1&publicHoldings=1", 1280, 900],
		["phone", "players=4&moves=50&merger=1&publicHoldings=1", 390, 844],
	]) {
		await page.setViewportSize({ width, height });
		for (const theme of ["light", "dark"]) {
			await open(`${params}&theme=${theme}`);
			const main = await page.locator("main").boundingBox();
			const hand = await page.locator(".layout > .hand").boundingBox();
			// Desktop shows the whole compact layout. On phones frame the complete decision, board
			// and hand, without appending a long column of tables, chat and history to the image.
			const captureHeight = Math.ceil(width < 700 ? hand.y + hand.height + 12 : main.height);
			assert.ok(captureHeight <= (width < 700 ? 1100 : 900), `${name}: gallery image became too tall`);
			if (captureHeight > page.viewportSize().height) {
				await page.setViewportSize({ width, height: captureHeight });
				await settle();
			}
			const screenshot = await page.screenshot({
				path: new URL(`${name}-${theme}.png`, output).pathname,
				clip: { x: 0, y: 0, width, height: captureHeight },
			});
			assert.equal(screenshot.readUInt32BE(16), width);
			assert.equal(screenshot.readUInt32BE(20), captureHeight);
			report.gallery.push({ name, theme, width, height: captureHeight });
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
			assert.equal(await page.locator(".explanation > p").count(), 2);
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
				await page.locator(".guide").getByRole("button", { name: "Price table", exact: true }).click();
				assert.equal(await page.locator(".guide .prices").count(), 1);
				await page.locator(".guide .toggle").click();
				await page.getByRole("button", { name: "Buy one more Tower", exact: true }).click();
				await page.getByRole("button", { name: "Buy one more Tower", exact: true }).click();
			}
			await page.locator("main .panel button.primary").click();
			await page.waitForSelector('.acquire-tutorial[data-completed="true"]');
			// Finishing used to make the entire game inert, including reference controls.
			assert.equal(await page.locator("main .panel button").count(), 0);
			assert.equal(await page.locator("section.hand button").count(), 0);
			await page.locator("main").getByRole("button", { name: "Price table", exact: true }).click();
			assert.equal(await page.locator("main .prices").count(), 1);
			await page.locator("main .toggle").click();
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
				await page.locator("main .market .toggle").click();
				assert.equal(await page.locator("main .prices").count(), 1, "resumed completed lesson keeps references usable");
				await page.locator("main .market .toggle").click();
			}
			await page.screenshot({ path: new URL(`tutorial-${chapter}-${width}.png`, output).pathname, fullPage: true });
			await page.locator(".guide nav button").first().click();
			await page.waitForSelector('.acquire-tutorial[data-step="2"][data-completed="false"]');
			assert.equal(await page.locator("main .panel button.primary").count(), 1, "previous step restores game actions");
		}
	}
	report.scenarios.push(
		"three tutorials completed through real controls on desktop and phone; reload, retry, rejected move, French/Persian resume, final scoring and usable references after completion"
	);

	// The new explanations are longer than action prompts. Exercise the price and bonus lessons
	// in every language, including their tables, at both desktop and the narrowest supported phone.
	for (const width of [1280, 320]) {
		await page.setViewportSize({ width, height: 900 });
		for (const locale of locales) {
			for (const chapter of ["founding", "mergers"]) {
				await page.evaluate(
					async ({ chapter, locale }) => {
						localStorage.removeItem(`bgs:tutorial:acquire:${chapter}`);
						await window.acquire.launchTutorial("#app", { chapter, locale });
					},
					{ chapter, locale }
				);
				await page.locator("section.hand button").click();
				await page.locator("main .panel .primary").click();
				await page.waitForSelector('.acquire-tutorial[data-step="1"]');
				if (chapter === "founding") {
					await page.locator(".choices button").filter({ hasText: "Tower" }).click();
					await page.waitForSelector('.acquire-tutorial[data-step="2"]');
					await page.locator(".guide .toggle").click();
					assert.equal(await page.locator(".guide .prices").count(), 1);
				}
				assert.equal(await page.locator(".explanation > p").count(), 2);
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
					`${chapter} ${locale} ${width}px explanation overflow`
				);
				report.tutorialLayouts.push({ width, locale, chapter });
				if (["en", "fr", "fa"].includes(locale)) {
					await page.screenshot({
						path: new URL(`explanation-${chapter}-${locale}-${width}.png`, output).pathname,
						fullPage: true,
					});
				}
			}
		}
	}
	report.scenarios.push(
		"share-price and bonus explanations in all 17 languages at desktop and 320px, with the tutorial price table open"
	);

	await page.emulateMedia({ colorScheme: "dark" });
	await page.reload();
	await page.waitForSelector('.acquire-tutorial[data-theme="dark"]');
	await page.emulateMedia({ colorScheme: "light" });
	await page.waitForSelector('.acquire-tutorial[data-theme="light"]');

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
