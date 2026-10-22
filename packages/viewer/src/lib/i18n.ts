// Viewer translations, bundled with the viewer. Follows BGS's preferences.locale live and falls
// back to English. Chain names and tile coordinates are never translated.
import { da } from "./locales/da.ts";
import { de } from "./locales/de.ts";
import { el } from "./locales/el.ts";
import { en } from "./locales/en.ts";
import { fa } from "./locales/fa.ts";
import { fr } from "./locales/fr.ts";
import { hi } from "./locales/hi.ts";
import { it } from "./locales/it.ts";
import { ko } from "./locales/ko.ts";
import { nl } from "./locales/nl.ts";
import { pl } from "./locales/pl.ts";
import { ptBR } from "./locales/pt-BR.ts";
import { ro } from "./locales/ro.ts";
import { ru } from "./locales/ru.ts";
import { vi } from "./locales/vi.ts";
import { zhCN } from "./locales/zh-CN.ts";
import { zhTW } from "./locales/zh-TW.ts";

export type MessageKey = keyof typeof en;
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Message = string | PluralMessage;
export type Catalog = Record<MessageKey, Message>;

// The BGS interface languages (packages/models/locale.ts in the BGS repository).
export const LOCALES = [
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
] as const;
export type Locale = (typeof LOCALES)[number];

export const CATALOGS: Record<Locale, Catalog> = {
	en,
	de,
	fr,
	pl,
	ro,
	el,
	hi,
	ru,
	da,
	"pt-BR": ptBR,
	ko,
	"zh-TW": zhTW,
	"zh-CN": zhCN,
	vi,
	it,
	nl,
	fa,
};

/** BGS sends a BCP-47 tag; match it exactly, then by language, else English. */
export function resolveLocale(tag: unknown): Locale {
	if (typeof tag !== "string") {
		return "en";
	}
	const exact = LOCALES.find((locale) => locale.toLowerCase() === tag.toLowerCase());
	if (exact) {
		return exact;
	}
	const language = tag.split("-")[0]!.toLowerCase();
	if (language === "zh") {
		return /hant|tw|hk|mo/i.test(tag) ? "zh-TW" : "zh-CN";
	}
	if (language === "pt") {
		return "pt-BR";
	}
	return LOCALES.find((locale) => locale === language) ?? "en";
}

/** Persian is written right to left; the board and its coordinates stay left to right. */
export function isRightToLeft(locale: Locale): boolean {
	return locale === "fa";
}

export type Params = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params: Params = {}): string {
	const message: Message = CATALOGS[locale][key] ?? en[key];
	let template: string;
	if (typeof message === "string") {
		template = message;
	} else {
		const count = Number(params.count ?? 0);
		const category = new Intl.PluralRules(locale).select(count);
		template = message[category] ?? message.other;
	}
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		params[name] === undefined ? match : String(params[name])
	);
}

/** "A, B and C" in the locale's own words. */
export function joinList(locale: Locale, items: string[]): string {
	return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}

/** Dollars with the locale's digit grouping. Digits stay Latin to match coordinates and counts. */
export function formatMoney(locale: Locale, amount: number): string {
	return `$${new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(amount)}`;
}
