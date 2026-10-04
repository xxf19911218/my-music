import assert from 'node:assert/strict';
import { calculateGrooveRingCount } from './groove-visualizer.js';

const maxRings = 30;

assert.equal(calculateGrooveRingCount({ bass: 0, mid: 0, treble: 0, maxRings }), 0);

const bassCount = calculateGrooveRingCount({ bass: 0.9, mid: 0.05, treble: 0, maxRings });
const midCount = calculateGrooveRingCount({ bass: 0.05, mid: 0.9, treble: 0.05, maxRings });
const trebleCount = calculateGrooveRingCount({ bass: 0, mid: 0.05, treble: 0.9, maxRings });

assert.ok(bassCount > 0, 'bass should create a few groove rings');
assert.ok(bassCount < midCount, 'mid frequency should draw more rings than bass');
assert.ok(midCount < trebleCount, 'high frequency should draw the most rings');
assert.ok(trebleCount <= maxRings, 'ring count should stay inside the visible record');
