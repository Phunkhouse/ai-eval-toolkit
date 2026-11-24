export function check(evaluator, criterion, status, severity, message, details) {
    const r = { evaluator, criterion, status, severity, message };
    if (details !== undefined)
        r.details = details;
    return r;
}
/** A check that could not run because the output did not parse; the parse failure itself is reported by the schema evaluator. */
export function notParsed(evaluator, criterion, severity, ctx) {
    const reason = ctx.parsed.ok ? '' : ` (${ctx.parsed.reason})`;
    return check(evaluator, criterion, 'skipped', severity, `not evaluated: output did not parse${reason}`);
}
/**
 * Normalization for quotation matching: Unicode NFKC, typographic quotes, dashes and ellipses to
 * ASCII, non-breaking spaces and runs of whitespace to one space, trimmed. Case is kept unless asked.
 */
export function normalizeText(text, mode) {
    if (mode === 'exact')
        return text;
    let t = text
        .normalize('NFKC')
        .replace(/[‘’‚‛′]/g, "'")
        .replace(/[“”„‟″]/g, '"')
        .replace(/[‐-―−]/g, '-')
        .replace(/…/g, '...')
        .replace(/\s+/g, ' ')
        .trim();
    if (mode === 'normalized-case-insensitive')
        t = t.toLowerCase();
    return t;
}
/** Text form of an output, for content checks: strings as is, anything else as JSON. */
export function outputText(raw) {
    if (typeof raw === 'string')
        return raw;
    if (raw === undefined || raw === null)
        return '';
    try {
        return JSON.stringify(raw);
    }
    catch {
        return String(raw);
    }
}
export function describeValue(v) {
    if (v === undefined)
        return 'missing';
    const s = typeof v === 'string' ? JSON.stringify(v) : outputText(v);
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}
