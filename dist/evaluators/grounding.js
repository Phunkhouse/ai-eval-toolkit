import { ratio } from '../metrics/stats.js';
import { check, normalizeText, notParsed } from './util.js';
const DEFAULT_SEVERITY = {
    fabricated: 'critical',
    unknownSource: 'critical',
    misattributed: 'major',
    missing: 'major',
    tooShort: 'major',
    expectedEvidence: 'major',
};
/**
 * Verifies quotations against the case's source documents.
 *
 * It checks **citation existence** (the quoted text occurs in a source) and **citation attribution**
 * (it occurs in the source the output names). It does **not** check semantic support (whether the
 * quotation supports the claim made with it) or factual correctness; a real quotation can be used
 * to justify a wrong conclusion. Use a label, field or human check for that.
 */
export function quoteEvaluator(options) {
    const id = options.id ?? 'quotes';
    const match = options.match ?? 'normalized';
    const minLength = options.minQuoteLength ?? 12;
    const require = options.requireCitations ?? 'when-answering';
    const sev = { ...DEFAULT_SEVERITY, ...options.severity };
    const occursIn = (quote, source) => {
        const text = normalizeText(source.text, match);
        const q = normalizeText(quote, match);
        if (text.includes(q))
            return true;
        if (!options.allowEllipsis || !q.includes('...'))
            return false;
        let from = 0;
        for (const fragment of q.split('...').map((f) => f.trim()).filter(Boolean)) {
            const at = text.indexOf(fragment, from);
            if (at < 0)
                return false;
            from = at + fragment.length;
        }
        return true;
    };
    return {
        id,
        version: '1',
        kind: 'deterministic',
        description: 'Quotations exist in the cited source (existence and attribution only, not semantic support)',
        limitations: [
            'Quotation checks verify that quoted text exists in the cited source (existence and attribution). They do not verify that the quotation supports the claim, nor that the conclusion is correct.',
        ],
        config: { match, minLength, require, allowEllipsis: !!options.allowEllipsis, requireExpectedEvidence: !!options.requireExpectedEvidence, severity: sev },
        evaluate(ctx) {
            if (!ctx.parsed.ok)
                return [notParsed(id, 'quote-exists', sev.fabricated, ctx)];
            const behavior = ctx.case.expected?.behavior;
            const citations = (options.getCitations(ctx.parsed.value, ctx) ?? []).filter((c) => c && typeof c.quote === 'string');
            const results = [];
            if (citations.length === 0) {
                const required = require === 'always' || (require === 'when-answering' && behavior !== 'abstain' && behavior !== 'refuse');
                if (required)
                    results.push(check(id, 'citation-present', 'fail', sev.missing, 'the answer cites no evidence'));
                else
                    return [];
            }
            const sources = ctx.sources;
            citations.forEach((c, i) => {
                const label = `citation ${i + 1}`;
                const quote = c.quote;
                if (normalizeText(quote, match).length < minLength) {
                    results.push(check(id, 'quote-length', 'fail', sev.tooShort, `${label}: quotation "${quote}" is shorter than ${minLength} characters and proves nothing`));
                    return;
                }
                const named = c.sourceId ? sources.find((s) => s.id === c.sourceId) : undefined;
                if (c.sourceId && !named) {
                    results.push(check(id, 'source-id', 'fail', sev.unknownSource, `${label}: source "${c.sourceId}" does not exist for this case`, { sourceId: c.sourceId, known: sources.map((s) => s.id) }));
                    return;
                }
                const target = named ?? (sources.length === 1 ? sources[0] : undefined);
                if (target && occursIn(quote, target)) {
                    results.push(check(id, 'quote-exists', 'pass', sev.fabricated, `${label}: found in "${target.id}"`));
                    return;
                }
                const elsewhere = sources.filter((s) => s !== target && occursIn(quote, s));
                if (elsewhere.length > 0 && target) {
                    results.push(check(id, 'quote-attribution', 'fail', sev.misattributed, `${label}: quotation exists in "${elsewhere[0].id}", not in the cited "${target.id}"`, { cited: target.id, foundIn: elsewhere.map((s) => s.id) }));
                }
                else if (elsewhere.length > 0) {
                    results.push(check(id, 'quote-exists', 'pass', sev.fabricated, `${label}: found in "${elsewhere[0].id}"`));
                    results.push(check(id, 'quote-attribution', 'skipped', sev.misattributed, `${label}: no source id given and the case has ${sources.length} sources; attribution not checked`));
                }
                else {
                    results.push(check(id, 'quote-exists', 'fail', sev.fabricated, `${label}: quotation not found in ${target ? `"${target.id}"` : 'any source'} — fabricated or altered`, { quote }));
                }
            });
            if (options.requireExpectedEvidence) {
                for (const ev of ctx.case.expected?.evidence ?? []) {
                    const want = normalizeText(ev.quote, match);
                    const covered = citations.some((c) => {
                        const got = normalizeText(c.quote, match);
                        return (!c.sourceId || c.sourceId === ev.sourceId) && got.length >= minLength && (got.includes(want) || want.includes(got));
                    });
                    results.push(check(id, 'expected-evidence', covered ? 'pass' : 'fail', sev.expectedEvidence, covered ? `cites the expected evidence from "${ev.sourceId}"` : `does not cite the expected evidence "${ev.quote}" from "${ev.sourceId}"`));
                }
            }
            return results;
        },
        summarize(cases) {
            // Each citation ends in exactly one outcome check; an unattributed match adds a skipped one.
            let total = 0;
            let verified = 0;
            let fabricated = 0;
            let misattributed = 0;
            let tooShort = 0;
            let missing = 0;
            for (const k of cases.flatMap((c) => c.checks)) {
                if (k.criterion === 'citation-present' && k.status === 'fail')
                    missing++;
                else if (k.criterion === 'quote-exists' && k.status === 'pass') {
                    total++;
                    verified++;
                }
                else if ((k.criterion === 'quote-exists' || k.criterion === 'source-id') && k.status === 'fail') {
                    total++;
                    fabricated++;
                }
                else if (k.criterion === 'quote-attribution' && k.status === 'fail') {
                    total++;
                    misattributed++;
                }
                else if (k.criterion === 'quote-length' && k.status === 'fail') {
                    total++;
                    tooShort++;
                }
            }
            return {
                metrics: [
                    ratio(`${id}.verified_rate`, verified, total, 'citations found in a source, of all citations checked'),
                    { name: `${id}.fabricated`, value: fabricated, unit: 'count', note: 'quotations found in no source, or citing a source that does not exist' },
                    { name: `${id}.misattributed`, value: misattributed, unit: 'count' },
                    { name: `${id}.too_short`, value: tooShort, unit: 'count' },
                    { name: `${id}.answers_without_citations`, value: missing, unit: 'count' },
                ],
            };
        },
    };
}
