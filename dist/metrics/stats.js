/** 95% Wilson score interval; better behaved than the normal approximation for small n and extreme rates. */
export function wilsonInterval(successes, n, z = 1.96) {
    if (n <= 0)
        return undefined;
    const p = successes / n;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const centre = (p + z2 / (2 * n)) / denom;
    const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
    return [round(Math.max(0, centre - half)), round(Math.min(1, centre + half))];
}
/** A ratio metric with its numerator and denominator; `null` when the denominator is zero. */
export function ratio(name, numerator, denominator, note) {
    const m = { name, value: denominator > 0 ? round(numerator / denominator) : null, numerator, denominator, unit: 'ratio' };
    const interval = wilsonInterval(numerator, denominator);
    if (interval)
        m.interval = interval;
    if (denominator === 0)
        m.note = note ? `${note}; undefined (0/0)` : 'undefined (0/0)';
    else if (note)
        m.note = note;
    return m;
}
export function count(name, value, note) {
    return note ? { name, value, unit: 'count', note } : { name, value, unit: 'count' };
}
export function round(x, digits = 4) {
    const f = 10 ** digits;
    return Math.round(x * f) / f;
}
/** Nearest-rank percentile of a list of numbers; undefined for an empty list. */
export function percentile(values, p) {
    if (values.length === 0)
        return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
    return sorted[rank - 1];
}
export function formatRatio(m) {
    if (m.value === null)
        return `undefined (${m.numerator ?? 0}/${m.denominator ?? 0})`;
    return `${(m.value * 100).toFixed(1)}% (${m.numerator}/${m.denominator})`;
}
