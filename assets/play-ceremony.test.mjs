import assert from 'node:assert/strict';
import { calculatePlayCeremony } from './play-ceremony.js';

const idle = calculatePlayCeremony({ elapsed: 0, isPlaying: false, duration: 1.4 });
assert.equal(idle.progress, 0);
assert.equal(idle.grooveBloom, 0);
assert.equal(idle.recordBoost, 0);

const start = calculatePlayCeremony({ elapsed: 0.1, isPlaying: true, duration: 1.4 });
const middle = calculatePlayCeremony({ elapsed: 0.7, isPlaying: true, duration: 1.4 });
const end = calculatePlayCeremony({ elapsed: 1.6, isPlaying: true, duration: 1.4 });

assert.ok(start.armLift > 0.2, 'play start should lift the tonearm before landing');
assert.ok(middle.grooveBloom > start.grooveBloom, 'grooves should bloom after playback begins');
assert.ok(middle.labelGlow > start.labelGlow, 'label glow should swell during the landing moment');
assert.ok(end.progress === 1, 'ceremony should settle after its duration');
assert.ok(end.recordBoost < middle.recordBoost, 'record speed boost should settle after the entrance');
