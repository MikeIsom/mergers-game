// Colour maths for the palette test: colour-vision deficiency simulation, CIEDE2000 colour
// difference and WCAG contrast. Plain functions, no dependencies.

export type Rgb = [number, number, number];
export type Deficiency = "protanopia" | "deuteranopia" | "tritanopia";

export function hexToRgb(hex: string): Rgb {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
	if (!match) {
		throw new Error(`Not a #rrggbb colour: ${hex}`);
	}
	return [parseInt(match[1]!, 16) / 255, parseInt(match[2]!, 16) / 255, parseInt(match[3]!, 16) / 255];
}

function toLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toGamma(c: number): number {
	const clamped = Math.min(1, Math.max(0, c));
	return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

// Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for Simulation of
// Color Vision Deficiency", severity 1.0 matrices, applied to linear RGB.
const MACHADO: Record<Deficiency, number[][]> = {
	protanopia: [
		[0.152286, 1.052583, -0.204868],
		[0.114503, 0.786281, 0.099216],
		[-0.003882, -0.048116, 1.051998],
	],
	deuteranopia: [
		[0.367322, 0.860646, -0.227968],
		[0.280085, 0.672501, 0.047413],
		[-0.01182, 0.04294, 0.968881],
	],
	tritanopia: [
		[1.255528, -0.076749, -0.178779],
		[-0.078411, 0.930809, 0.147602],
		[0.004733, 0.691367, 0.3039],
	],
};

/** How an sRGB colour (0-1 channels) appears with a full colour-vision deficiency. */
export function simulate(rgb: Rgb, deficiency: Deficiency): Rgb {
	const linear = rgb.map(toLinear);
	const m = MACHADO[deficiency];
	return m.map((row) => toGamma(row[0]! * linear[0]! + row[1]! * linear[1]! + row[2]! * linear[2]!)) as Rgb;
}

/** sRGB (0-1) to CIE L*a*b* with a D65 white point. */
export function rgbToLab(rgb: Rgb): Rgb {
	const [r, g, b] = rgb.map(toLinear) as Rgb;
	const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
	const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
	const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
	const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
	const [fx, fy, fz] = [f(x), f(y), f(z)];
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** CIEDE2000 colour difference between two L*a*b* colours (Sharma, Wu & Dalal 2005). */
export function deltaE2000(lab1: Rgb, lab2: Rgb): number {
	const [l1, a1, b1] = lab1;
	const [l2, a2, b2] = lab2;
	const c1 = Math.hypot(a1, b1);
	const c2 = Math.hypot(a2, b2);
	const cBar7 = ((c1 + c2) / 2) ** 7;
	const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
	const a1p = (1 + g) * a1;
	const a2p = (1 + g) * a2;
	const c1p = Math.hypot(a1p, b1);
	const c2p = Math.hypot(a2p, b2);
	const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
	const h1p = hue(b1, a1p);
	const h2p = hue(b2, a2p);

	const dLp = l2 - l1;
	const dCp = c2p - c1p;
	let dhp = 0;
	if (c1p * c2p !== 0) {
		dhp = h2p - h1p;
		if (dhp > 180) {
			dhp -= 360;
		} else if (dhp < -180) {
			dhp += 360;
		}
	}
	const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2));

	const lBarP = (l1 + l2) / 2;
	const cBarP = (c1p + c2p) / 2;
	let hBarP = h1p + h2p;
	if (c1p * c2p !== 0) {
		if (Math.abs(h1p - h2p) <= 180) {
			hBarP = (h1p + h2p) / 2;
		} else {
			hBarP = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
		}
	}
	const t =
		1 -
		0.17 * Math.cos(rad(hBarP - 30)) +
		0.24 * Math.cos(rad(2 * hBarP)) +
		0.32 * Math.cos(rad(3 * hBarP + 6)) -
		0.2 * Math.cos(rad(4 * hBarP - 63));
	const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
	const cBarP7 = cBarP ** 7;
	const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7));
	const sL = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
	const sC = 1 + 0.045 * cBarP;
	const sH = 1 + 0.015 * cBarP * t;
	const rT = -Math.sin(rad(2 * dTheta)) * rC;
	return Math.sqrt((dLp / sL) ** 2 + (dCp / sC) ** 2 + (dHp / sH) ** 2 + rT * (dCp / sC) * (dHp / sH));
}

/** CIEDE2000 difference between two hex colours, optionally as seen with a deficiency. */
export function difference(hex1: string, hex2: string, deficiency?: Deficiency): number {
	const see = (hex: string) => (deficiency ? simulate(hexToRgb(hex), deficiency) : hexToRgb(hex));
	return deltaE2000(rgbToLab(see(hex1)), rgbToLab(see(hex2)));
}

/** WCAG 2 relative luminance and contrast ratio. */
export function contrastRatio(hex1: string, hex2: string): number {
	const luminance = (hex: string) => {
		const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const [high, low] = [luminance(hex1), luminance(hex2)].sort((a, b) => b - a) as [number, number];
	return (high + 0.05) / (low + 0.05);
}
