// Adapted from the user's Typing Chimera SoundFX reference.
// All sounds are synthesized locally; no recordings or external assets are used.
export function createSoundRecipe(kind, random = Math.random) {
  const note = (frequency, end, duration, gain, type = 'sine', offset = 0, ramp = 'exponential') => ({ frequency, end, duration, gain, type, offset, ramp });
  switch (kind) {
    case 'click': return [note(1700, 450, .045, .045, 'triangle')];
    case 'key': return [note(540 + random() * 80, 180, .035, .08, 'triangle')];
    case 'miss': return [note(130, 80, .1, .09, 'sawtooth', 0, 'linear')];
    case 'plate': return [523.25, 659.25, 1046.5].map((frequency, i) => note(frequency, null, .4, .1, 'triangle', i * .05));
    case 'promote':
    case 'bonus': return [440, 554.37, 659.25, 880].map((frequency, i) => note(frequency, null, .3, .09, 'sine', i * .06));
    case 'demote': return [659.25, 554.37, 440].map((frequency, i) => note(frequency, null, .25, .06, 'sine', i * .08));
    case 'start': return [note(700, null, .12, .07)];
    case 'hint': return [note(330, 440, .09, .04)];
    case 'finish': return [261.63, 329.63, 392, 523.25].map((frequency, i) => note(frequency, null, .3, .08, 'triangle', i * .07));
    default: return [];
  }
}
export class SushiSound {
  constructor({ enabled = () => true, volume = () => .35, random = Math.random, createContext = () => {
    const Context = window.AudioContext || window.webkitAudioContext;
    return Context ? new Context() : null;
  } } = {}) {
    this.enabled = enabled; this.volume = volume; this.random = random; this.createContext = createContext;
    this.context = null; this.master = null; this.resuming = null;
    this.voices = new Set(); this.generation = 0; this.lastKeyAt = -Infinity;
  }
  level() {
    const value = Number(this.volume());
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .35;
  }
  updateVolume() {
    if (!this.context || !this.master) return;
    const value = this.enabled() ? this.level() : 0;
    try {
      if (this.master.gain.setTargetAtTime) this.master.gain.setTargetAtTime(value, this.context.currentTime, .01);
      else this.master.gain.setValueAtTime(value, this.context.currentTime);
    } catch { /* Audio remains optional. */ }
  }
  async init() {
    if (!this.enabled() || this.level() === 0) return false;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = this.createContext();
        if (!this.context) return false;
        this.master = this.context.createGain(); this.master.connect(this.context.destination);
        this.lastKeyAt = -Infinity;
      }
      if (this.context.state !== 'running') {
        if (!this.resuming) this.resuming = Promise.resolve(this.context.resume()).then(() => true, () => false).finally(() => { this.resuming = null; });
        if (!await this.resuming) return false;
      }
      this.updateVolume();
      return this.context.state === 'running' && this.enabled() && this.level() > 0;
    } catch { return false; }
  }
  stop() {
    this.generation++;
    for (const voice of this.voices) {
      try { voice.oscillator.stop(); } catch { /* It may have ended already. */ }
      try { voice.oscillator.disconnect(); voice.gain.disconnect(); } catch { /* Optional cleanup. */ }
    }
    this.voices.clear(); this.lastKeyAt = -Infinity;
    this.updateVolume();
  }
  async play(kind) {
    const recipe = createSoundRecipe(kind, this.random), generation = this.generation;
    if (!recipe.length || !await this.init() || generation !== this.generation || !this.enabled() || this.level() === 0) return false;
    const now = this.context.currentTime;
    if (kind === 'key') {
      if (now - this.lastKeyAt < .012) return false;
      this.lastKeyAt = now;
    }
    try {
      for (const note of recipe) {
        // Bound polyphony during fast typing; old tails never keep accumulating.
        while (this.voices.size >= 32) {
          const oldest = this.voices.values().next().value;
          try { oldest.oscillator.stop(); oldest.oscillator.disconnect(); oldest.gain.disconnect(); } catch { /* Already ended. */ }
          this.voices.delete(oldest);
        }
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        const start = now + note.offset, end = start + note.duration;
        oscillator.type = note.type; oscillator.frequency.setValueAtTime(note.frequency, start);
        if (note.end) {
          if (note.ramp === 'linear') oscillator.frequency.linearRampToValueAtTime(note.end, end);
          else oscillator.frequency.exponentialRampToValueAtTime(note.end, end);
        }
        gain.gain.setValueAtTime(note.gain, start);
        gain.gain.exponentialRampToValueAtTime(.0001, end);
        oscillator.connect(gain); gain.connect(this.master);
        const voice = { oscillator, gain }; this.voices.add(voice);
        oscillator.onended = () => {
          this.voices.delete(voice);
          try { oscillator.disconnect(); gain.disconnect(); } catch { /* Optional cleanup. */ }
        };
        oscillator.start(start); oscillator.stop(end);
      }
      return true;
    } catch { return false; }
  }
}
