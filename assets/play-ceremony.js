function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value) {
    const t = clamp01(value);
    return 1 - Math.pow(1 - t, 3);
}

function easeInOut(value) {
    const t = clamp01(value);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function calculatePlayCeremony({ elapsed = 0, isPlaying = false, duration = 1.4 } = {}) {
    if (!isPlaying || duration <= 0) {
        return {
            progress: 0,
            armLift: 0,
            recordBoost: 0,
            grooveBloom: 0,
            labelGlow: 0
        };
    }

    const progress = clamp01(elapsed / duration);
    const landingWindow = clamp01(progress / 0.62);
    const glowWindow = clamp01((progress - 0.06) / 0.76);
    const bloomWindow = clamp01((progress - 0.18) / 0.72);

    return {
        progress,
        armLift: Math.sin(landingWindow * Math.PI) * (1 - progress * 0.38),
        recordBoost: Math.sin(progress * Math.PI) * 0.72,
        grooveBloom: easeOutCubic(bloomWindow),
        labelGlow: Math.sin(glowWindow * Math.PI) * easeInOut(1 - Math.abs(progress - 0.52) * 0.72)
    };
}
