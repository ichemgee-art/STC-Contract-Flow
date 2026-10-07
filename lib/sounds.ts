let sharedContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) return null;
  if (!sharedContext) sharedContext = new AudioContextClass();
  return sharedContext;
}

export function primeUiAudio() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume();
  }
}

type SoundKind = "created" | "advance" | "completed" | "reopen" | "reminder";

const patterns: Record<SoundKind, Array<{ frequency: number; offset: number; duration: number; gain: number }>> = {
  created: [
    { frequency: 523.25, offset: 0, duration: 0.11, gain: 0.09 },
    { frequency: 659.25, offset: 0.09, duration: 0.13, gain: 0.1 },
    { frequency: 783.99, offset: 0.19, duration: 0.18, gain: 0.085 },
  ],
  advance: [
    { frequency: 659.25, offset: 0, duration: 0.11, gain: 0.1 },
    { frequency: 783.99, offset: 0.1, duration: 0.11, gain: 0.1 },
  ],
  completed: [
    { frequency: 523.25, offset: 0, duration: 0.1, gain: 0.085 },
    { frequency: 659.25, offset: 0.08, duration: 0.11, gain: 0.09 },
    { frequency: 783.99, offset: 0.16, duration: 0.12, gain: 0.095 },
    { frequency: 987.77, offset: 0.27, duration: 0.16, gain: 0.1 },
    { frequency: 1174.66, offset: 0.4, duration: 0.22, gain: 0.075 },
  ],
  reopen: [
    { frequency: 523.25, offset: 0, duration: 0.11, gain: 0.08 },
    { frequency: 392.0, offset: 0.1, duration: 0.14, gain: 0.08 },
  ],
  reminder: [
    { frequency: 587.33, offset: 0, duration: 0.13, gain: 0.1 },
    { frequency: 783.99, offset: 0.16, duration: 0.15, gain: 0.12 },
    { frequency: 987.77, offset: 0.34, duration: 0.18, gain: 0.11 },
  ],
};

export function playUiSound(kind: SoundKind) {
  const context = getAudioContext();
  if (!context) return;

  const play = () => {
    const now = context.currentTime + 0.01;

    for (const tone of patterns[kind]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.offset);

      gain.gain.setValueAtTime(0.0001, now + tone.offset);
      gain.gain.exponentialRampToValueAtTime(tone.gain, now + tone.offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.offset + tone.duration);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + tone.offset);
      oscillator.stop(now + tone.offset + tone.duration + 0.02);
    }
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}
