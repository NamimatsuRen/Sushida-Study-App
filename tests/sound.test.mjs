import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SushiSound, createSoundRecipe } from '../dist/sound.js';

function audioHarness(state = 'running') {
  const oscillators = [], gains = [];
  const param = () => ({ values: [], setValueAtTime(...args) { this.values.push(['set', ...args]); }, exponentialRampToValueAtTime(...args) { this.values.push(['exponential', ...args]); }, linearRampToValueAtTime(...args) { this.values.push(['linear', ...args]); }, setTargetAtTime(...args) { this.values.push(['target', ...args]); } });
  const context = {
    state, currentTime: 10, destination: {}, resumes: 0,
    async resume() { this.resumes++; this.state = 'running'; },
    createOscillator() {
      const node = { frequency: param(), stops: [], connect(target) { this.target = target; }, disconnect() { this.disconnected = true; }, start(at) { this.startAt = at; }, stop(at) { this.stops.push(at); } };
      oscillators.push(node); return node;
    },
    createGain() {
      const node = { gain: param(), connect(target) { this.target = target; }, disconnect() { this.disconnected = true; } };
      gains.push(node); return node;
    }
  };
  return { context, oscillators, gains };
}

test('reference sounds use distinct timbres, short key tails and ordered completion melodies', async () => {
  const h = audioHarness('suspended');
  const fx = new SushiSound({ createContext: () => h.context, random: () => .5 });
  assert.equal(await fx.play('key'), true); assert.equal(h.context.resumes, 1);
  const key = h.oscillators[0]; assert.equal(key.type, 'triangle');
  assert.deepEqual(key.frequency.values[0], ['set', 580, 10]);
  assert.deepEqual(key.frequency.values[1], ['exponential', 180, 10.035]);
  assert.equal(await fx.play('key'), false); // Same audio frame must not stack key voices.
  h.context.currentTime += .02; assert.equal(await fx.play('key'), true);
  await fx.play('miss'); assert.equal(h.oscillators[2].type, 'sawtooth');
  assert.equal(h.oscillators[2].frequency.values[1][0], 'linear');
  await fx.play('plate');
  const plate = h.oscillators.slice(-3);
  assert.deepEqual(plate.map(n => n.frequency.values[0][1]), [523.25, 659.25, 1046.5]);
  assert.ok(Math.abs(plate[2].startAt - plate[0].startAt - .1) < 1e-9);
  assert.deepEqual(createSoundRecipe('promote').map(n => n.frequency), [440, 554.37, 659.25, 880]);
  assert.deepEqual(createSoundRecipe('demote').map(n => n.frequency), [659.25, 554.37, 440]);
  assert.equal(h.gains[0].target, h.context.destination);
  assert.equal(plate[0].target.target, h.gains[0]);
});

test('mute cancels a pending first gesture and stops all scheduled melody notes', async () => {
  const h = audioHarness('suspended'); let enabled = true, resume;
  h.context.resume = () => new Promise(resolve => { resume = () => { h.context.state = 'running'; resolve(); }; });
  const fx = new SushiSound({ createContext: () => h.context, enabled: () => enabled });
  const pending = fx.play('promote'); enabled = false; fx.stop(); resume();
  assert.equal(await pending, false); assert.equal(h.oscillators.length, 0);
  enabled = true; assert.equal(await fx.play('promote'), true); assert.equal(fx.voices.size, 4);
  enabled = false; fx.stop(); assert.equal(fx.voices.size, 0);
  assert.ok(h.oscillators.every(n => n.stops.at(-1) === undefined && n.disconnected));
  assert.equal(await fx.play('plate'), false); assert.equal(h.oscillators.length, 4);
  assert.equal(h.gains[0].gain.values.at(-1)[1], 0);
});

test('master volume clamps, changes active sounds, and keeps zero volume silent', async () => {
  const h = audioHarness(); let volume = 3;
  const fx = new SushiSound({ createContext: () => h.context, volume: () => volume });
  await fx.play('click'); assert.equal(h.gains[0].gain.values.at(-1)[1], 1);
  volume = .2; fx.updateVolume(); assert.equal(h.gains[0].gain.values.at(-1)[1], .2);
  volume = -1; fx.stop(); assert.equal(await fx.play('plate'), false);
  assert.equal(h.gains[0].gain.values.at(-1)[1], 0);
});

test('rapid sound requests bound voice count and release ended nodes', async () => {
  const h = audioHarness(); const fx = new SushiSound({ createContext: () => h.context });
  for (let i = 0; i < 20; i++) await fx.play('plate');
  assert.equal(fx.voices.size, 32); assert.equal(h.oscillators.length, 60);
  assert.ok(h.oscillators.slice(0, 28).every(n => n.disconnected));
  const last = h.oscillators.at(-1); last.onended(); assert.equal(fx.voices.size, 31);
  assert.equal(last.disconnected, true); assert.equal(last.target.disconnected, true);
});

test('missing or rejected audio never throws or prevents play', async () => {
  const unsupported = new SushiSound({ createContext: () => null });
  assert.equal(await unsupported.play('key'), false);
  const h = audioHarness('suspended'); h.context.resume = () => Promise.reject(new Error('blocked'));
  assert.equal(await new SushiSound({ createContext: () => h.context }).play('plate'), false);
  let attempted = false;
  const disabled = new SushiSound({ enabled: () => false, createContext: () => { attempted = true; } });
  assert.equal(await disabled.play('key'), false); assert.equal(attempted, false);
  assert.equal(await disabled.play('unknown'), false);
});
