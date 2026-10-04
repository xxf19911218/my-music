const SILENCE_THRESHOLD = 0.035;

function cleanFrequencyValue(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

export function calculateGrooveRingCount({ bass = 0, mid = 0, treble = 0, maxRings = 30 } = {}) {
    const ringLimit = Math.max(0, maxRings);
    const cleanBass = cleanFrequencyValue(bass);
    const cleanMid = cleanFrequencyValue(mid);
    const cleanTreble = cleanFrequencyValue(treble);
    const total = cleanBass + cleanMid + cleanTreble;

    if (ringLimit === 0 || total <= SILENCE_THRESHOLD) return 0;

    const spectralPosition = (
        cleanBass * 0.28 +
        cleanMid * 0.62 +
        cleanTreble
    ) / total;
    const energyGate = Math.max(
        cleanBass,
        cleanMid * 0.95,
        cleanTreble * 0.9,
        total / 1.1
    );
    const shapedEnergy = Math.pow(Math.min(1, energyGate), 0.58);

    return Math.min(ringLimit, Math.max(0, ringLimit * spectralPosition * shapedEnergy));
}