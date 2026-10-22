import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAINS } from "acquire-engine";
import { CATALOGS, formatMoney, LOCALES, resolveLocale, translate, type Message } from "./i18n.ts";
import { en } from "./locales/en.ts";

const forms = (message: Message): [string, string][] =>
	typeof message === "string" ? [["", message]] : Object.entries(message);

const placeholders = (text: string): Set<string> => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));

test("every locale has exactly the English keys", () => {
	const keys = Object.keys(en).sort();
	for (const locale of LOCALES) {
		assert.deepEqual(Object.keys(CATALOGS[locale]).sort(), keys, locale);
	}
});

test("every translation keeps the English placeholders", () => {
	for (const locale of LOCALES) {
		for (const [key, english] of Object.entries(en)) {
			const allowed = new Set(forms(english).flatMap(([, text]) => [...placeholders(text)]));
			const required = placeholders(forms(english).find(([form]) => form === "other" || form === "")![1]);
			for (const [form, text] of forms(CATALOGS[locale][key as keyof typeof en])) {
				const found = placeholders(text);
				for (const name of found) {
					assert.ok(allowed.has(name), `${locale} ${key} ${form}: unknown {${name}}`);
				}
				for (const name of required) {
					// A singular form may spell out the number ("a tile") instead of using {count}.
					if (name === "count" && form !== "other") {
						continue;
					}
					assert.ok(found.has(name), `${locale} ${key} ${form}: missing {${name}}`);
				}
			}
		}
	}
});

test("plural messages use exactly the locale's plural categories", () => {
	for (const locale of LOCALES) {
		const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.slice().sort();
		for (const [key, message] of Object.entries(CATALOGS[locale])) {
			if (typeof message === "string") {
				assert.equal(typeof en[key as keyof typeof en], "string", `${locale} ${key} should be plural`);
				continue;
			}
			assert.deepEqual(Object.keys(message).sort(), categories, `${locale} ${key}`);
		}
	}
});

test("plural forms follow the locale's rules", () => {
	assert.equal(translate("en", "tiles", { count: 1 }), "1 tile");
	assert.equal(translate("en", "tiles", { count: 2 }), "2 tiles");
	assert.equal(translate("pl", "tiles", { count: 3 }), translate("pl", "tiles", { count: 23 }).replace("23", "3"));
	assert.notEqual(
		translate("pl", "tiles", { count: 5 }).replace("5", "#"),
		translate("pl", "tiles", { count: 3 }).replace("3", "#")
	);
	assert.notEqual(
		translate("ru", "tiles", { count: 1 }).replace("1", "#"),
		translate("ru", "tiles", { count: 5 }).replace("5", "#")
	);
});

test("chain names and tile coordinates are never translated", () => {
	for (const locale of LOCALES) {
		for (const chain of CHAINS) {
			const text = translate(locale, "board.chain", { tile: "5C", chain: chain.name });
			assert.ok(text.includes(chain.name) && text.includes("5C"), `${locale}: ${text}`);
		}
	}
});

test("money is in dollars with Latin digits in every locale", () => {
	for (const locale of LOCALES) {
		assert.match(formatMoney(locale, 12000), /^\$12\D?000$/, locale);
	}
});

test("BGS locale tags resolve to a bundled catalogue, else English", () => {
	assert.equal(resolveLocale("de"), "de");
	assert.equal(resolveLocale("de-AT"), "de");
	assert.equal(resolveLocale("pt-BR"), "pt-BR");
	assert.equal(resolveLocale("pt-PT"), "pt-BR");
	assert.equal(resolveLocale("zh-TW"), "zh-TW");
	assert.equal(resolveLocale("zh-Hant-HK"), "zh-TW");
	assert.equal(resolveLocale("zh"), "zh-CN");
	assert.equal(resolveLocale("ZH-cn"), "zh-CN");
	assert.equal(resolveLocale("ja"), "en");
	assert.equal(resolveLocale(undefined), "en");
});
