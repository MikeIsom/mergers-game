import type { GameState, LogEntry } from "acquire-engine";

export type SoundCue = "place" | "found" | "merge" | "cash" | "end";
type Note = readonly [offset: number, frequency: number, duration: number, level: number];
// Short tactile cues with layered resonances, made locally with Web Audio.
// The levels leave headroom even when the harmonics overlap.
const notes: Record<SoundCue, readonly Note[]> = {
	place: [
		[0, 210, 0.09, 0.15],
		[0, 640, 0.04, 0.065],
		[0.008, 1280, 0.025, 0.025],
	],
	found: [
		[0, 210, 0.075, 0.12],
		[0.035, 523.25, 0.19, 0.12],
		[0.11, 659.25, 0.24, 0.12],
		[0.11, 1318.5, 0.09, 0.025],
	],
	merge: [
		[0, 180, 0.1, 0.14],
		[0.06, 240, 0.08, 0.12],
		[0.12, 320, 0.1, 0.12],
		[0.16, 392, 0.25, 0.09],
		[0.16, 523.25, 0.28, 0.09],
		[0.16, 659.25, 0.3, 0.09],
	],
	cash: [
		[0, 1174.66, 0.14, 0.1],
		[0, 3242, 0.055, 0.04],
		[0.085, 1567.98, 0.2, 0.1],
		[0.085, 4328, 0.06, 0.04],
	],
	end: [
		[0, 523.25, 0.23, 0.12],
		[0.12, 659.25, 0.23, 0.12],
		[0.24, 783.99, 0.28, 0.12],
		[0.36, 1046.5, 0.4, 0.1],
		[0.36, 523.25, 0.4, 0.06],
	],
};

export function cueForEntries(entries: readonly LogEntry[]): SoundCue | undefined {
	// Reconnects may deliver many turns at once. Never play their backlog.
	if (entries.filter((entry) => entry.type === "move" && !entry.auto).length !== 1) {
		return;
	}
	if (entries.some((entry) => entry.type === "gameEnd")) {
		return "end";
	}
	if (entries.some((entry) => entry.type === "merger" || entry.type === "merged")) {
		return "merge";
	}
	if (entries.some((entry) => entry.type === "founded")) {
		return "found";
	}
	if (
		entries.some(
			(entry) =>
				entry.type === "bonuses" ||
				entry.type === "swapped" ||
				(entry.type === "bought" && entry.cost > 0) ||
				(entry.type === "disposed" && (entry.sold > 0 || entry.traded > 0))
		)
	) {
		return "cash";
	}
	if (entries.some((entry) => entry.type === "move" && entry.move.type === "place")) {
		return "place";
	}
}

/** Keep the cursor up to date even when muted or replaying, so nothing queues. */
export class ActionSoundTracker {
	private length = 0;
	private tail: string | undefined;
	observe(state: Pick<GameState, "log">): SoundCue | undefined {
		const { log } = state;
		const continuous =
			this.tail !== undefined && log.length > this.length && JSON.stringify(log[this.length - 1]) === this.tail;
		const added = continuous ? log.slice(this.length) : [];
		this.length = log.length;
		this.tail = log.length ? JSON.stringify(log.at(-1)) : undefined;
		return cueForEntries(added);
	}
}

export function createActionSounds(target: Element) {
	const tracker = new ActionSoundTracker();
	let context: AudioContext | undefined;
	let enabled = true;
	let analysis = false;
	let replaying = false;
	let destroyed = false;
	const voices = new Set<OscillatorNode>();
	const stop = () => {
		for (const voice of voices) {
			try {
				voice.stop();
				voice.disconnect();
			} catch {
				// A disconnected audio device must not interrupt preference changes.
			}
		}
		voices.clear();
	};
	const unlock = () => {
		if (!enabled || destroyed || !window.AudioContext) {
			return;
		}
		try {
			context ??= new AudioContext();
			if (context.state === "suspended") {
				void context.resume().catch(() => {});
			}
		} catch {
			// Audio may be unavailable or blocked; game actions must still work.
		}
	};
	target.addEventListener("pointerdown", unlock, { capture: true });
	target.addEventListener("keydown", unlock, { capture: true });
	const play = (cue: SoundCue) => {
		if (!enabled || analysis || replaying || destroyed || document.hidden || context?.state !== "running") {
			return;
		}
		try {
			stop();
			for (const [offset, frequency, duration, level] of notes[cue]) {
				const start = context.currentTime + offset;
				const voice = context.createOscillator();
				const gain = context.createGain();
				voice.type = frequency < 350 ? "triangle" : "sine";
				voice.frequency.setValueAtTime(frequency, start);
				if (frequency < 350) {
					voice.frequency.exponentialRampToValueAtTime(frequency * 0.6, start + duration);
				}
				gain.gain.setValueAtTime(0, start);
				gain.gain.linearRampToValueAtTime(level, start + 0.003);
				gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
				voice.connect(gain);
				gain.connect(context.destination);
				voices.add(voice);
				voice.onended = () => {
					voices.delete(voice);
					voice.disconnect();
					gain.disconnect();
				};
				voice.start(start);
				voice.stop(start + duration + 0.01);
			}
		} catch {
			// Do not let an audio-device failure prevent a state update.
		}
	};
	return {
		onState(state: GameState) {
			const cue = tracker.observe(state);
			if (cue) {
				play(cue);
			}
		},
		onPreferences(preferences: Record<string, unknown>) {
			if (typeof preferences.sound === "boolean") {
				enabled = preferences.sound;
			}
			analysis = preferences.analysis === true;
			if (!enabled || analysis) {
				stop();
			}
		},
		onReplayStart() {
			replaying = true;
			stop();
		},
		onReplayEnd() {
			replaying = false;
		},
		destroy() {
			destroyed = true;
			target.removeEventListener("pointerdown", unlock, { capture: true });
			target.removeEventListener("keydown", unlock, { capture: true });
			stop();
			if (context && context.state !== "closed") {
				void context.close().catch(() => {});
			}
		},
	};
}
