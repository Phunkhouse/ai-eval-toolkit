import { ratio } from '../metrics/stats.js';
import { check, describeValue, normalizeText, notParsed } from './util.js';
function compareField(spec, expected, actual) {
    const absent = actual === undefined || actual === null || actual === '';
    if (expected === null) {
        return absent ? { ok: true } : { ok: false, kind: 'should-be-empty', message: `expected no value (the source does not contain it), got ${describeValue(actual)}` };
    }
    if (absent)
        return { ok: false, kind: 'missing', message: `missing; expected ${describeValue(expected)}` };
    const s = typeof spec === 'string' ? { type: spec } : spec;
    const mismatch = () => ({ ok: false, kind: 'mismatch', message: `got ${describeValue(actual)}, expected ${describeValue(expected)}` });
    switch (s.type) {
        case 'number': {
            if (typeof actual !== 'number' || !Number.isFinite(actual))
                return { ok: false, kind: 'type', message: `got ${describeValue(actual)}, expected a number (${describeValue(expected)})` };
            const e = Number(expected);
            const tol = Math.max(s.abs ?? 0, (s.rel ?? 0) * Math.abs(e));
            return Math.abs(actual - e) <= tol + Number.EPSILON * Math.max(1, Math.abs(e)) ? { ok: true } : mismatch();
        }
        case 'string': {
            if (typeof actual !== 'string')
                return { ok: false, kind: 'type', message: `got ${describeValue(actual)}, expected a string` };
            const mode = s.match ?? 'exact';
            const norm = (v) => (mode === 'exact' ? v : mode === 'normalized' ? normalizeText(v, 'normalized') : normalizeText(v, 'normalized-case-insensitive'));
            return norm(actual) === norm(String(expected)) ? { ok: true } : mismatch();
        }
        case 'date': {
            if (typeof actual !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(actual))
                return { ok: false, kind: 'type', message: `got ${describeValue(actual)}, expected an ISO date YYYY-MM-DD` };
            return actual === expected ? { ok: true } : mismatch();
        }
        case 'custom':
            return s.compare(expected, actual) ? { ok: true } : mismatch();
        default:
            return JSON.stringify(actual) === JSON.stringify(expected) ? { ok: true } : mismatch();
    }
}
function describeSpec(spec) {
    if (typeof spec === 'string')
        return spec;
    if (spec.type === 'custom')
        return { type: 'custom', description: spec.description };
    return spec;
}
/**
 * Field-level extraction checks against `expected.fields`. An expected `null` means the value is not
 * in the source and the output must leave it empty, which catches invented values. Cases expecting
 * an abstention or refusal are left to the behavior evaluator.
 */
export function fieldsEvaluator(options) {
    const id = options.id ?? 'fields';
    const base = options.severity ?? 'major';
    const sevOf = (name) => {
        const spec = options.fields[name];
        return (spec && typeof spec !== 'string' && spec.severity) || base;
    };
    const applies = (ctx) => {
        const b = ctx.case.expected?.behavior;
        return !!ctx.case.expected?.fields && b !== 'abstain' && b !== 'refuse';
    };
    const checkedFields = (ctx) => Object.keys(ctx.case.expected?.fields ?? {}).filter((f) => f in options.fields);
    return {
        id,
        version: '1',
        kind: 'deterministic',
        description: 'Extracted fields match the expected values',
        config: { fields: Object.fromEntries(Object.entries(options.fields).map(([k, v]) => [k, describeSpec(v)])), severity: base },
        evaluate(ctx) {
            if (!applies(ctx))
                return [];
            const names = checkedFields(ctx);
            if (names.length === 0)
                return [];
            if (!ctx.parsed.ok)
                return [notParsed(id, 'fields', base, ctx)];
            const got = options.getFields(ctx.parsed.value, ctx) ?? {};
            const results = [];
            for (const name of names) {
                const outcome = compareField(options.fields[name], ctx.case.expected.fields[name], got[name]);
                results.push(outcome.ok ? check(id, `field:${name}`, 'pass', sevOf(name), 'matches') : check(id, `field:${name}`, 'fail', sevOf(name), outcome.message, { kind: outcome.kind }));
            }
            return results;
        },
        summarize(cases) {
            const perField = new Map();
            let casesAllCorrect = 0;
            let casesChecked = 0;
            let unparsed = 0;
            for (const c of cases) {
                if (!applies(c))
                    continue;
                const names = checkedFields(c);
                if (names.length === 0)
                    continue;
                casesChecked++;
                if (!c.parsed.ok)
                    unparsed++;
                let all = true;
                for (const name of names) {
                    const stat = perField.get(name) ?? { correct: 0, total: 0, invented: 0, missing: 0 };
                    stat.total++;
                    const k = c.checks.find((x) => x.criterion === `field:${name}`);
                    if (k?.status === 'pass')
                        stat.correct++;
                    else {
                        all = false;
                        const kind = k?.details?.kind;
                        if (kind === 'should-be-empty')
                            stat.invented++;
                        if (kind === 'missing')
                            stat.missing++;
                    }
                    perField.set(name, stat);
                }
                if (all)
                    casesAllCorrect++;
            }
            let correct = 0;
            let total = 0;
            for (const s of perField.values()) {
                correct += s.correct;
                total += s.total;
            }
            const note = unparsed ? `includes ${unparsed} case(s) whose output did not parse, counted as wrong` : undefined;
            const metrics = [ratio(`${id}.accuracy`, correct, total, note), ratio(`${id}.exact_match_rate`, casesAllCorrect, casesChecked, 'cases with every checked field correct')];
            for (const [name, s] of perField)
                metrics.push(ratio(`${id}.accuracy.${name}`, s.correct, s.total));
            const table = {
                title: 'Per-field results',
                columns: ['Field', 'Correct', 'Checked', 'Accuracy', 'Invented (expected empty)', 'Missing'],
                rows: [...perField].map(([name, s]) => [name, s.correct, s.total, s.total ? Math.round((s.correct / s.total) * 1000) / 1000 : null, s.invented, s.missing]),
            };
            return { metrics, tables: [table] };
        },
    };
}
