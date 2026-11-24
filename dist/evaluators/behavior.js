import { ratio } from '../metrics/stats.js';
import { check } from './util.js';
const BEHAVIORS = ['answer', 'abstain', 'refuse'];
/** Compares what the system did with `expected.behavior`, and measures abstention precision and recall. */
export function behaviorEvaluator(options) {
    const id = options.id ?? 'behavior';
    const answeredInstead = options.severity?.answeredInstead ?? 'critical';
    const other = options.severity?.other ?? 'major';
    return {
        id,
        version: '1',
        kind: 'deterministic',
        description: 'Answers, abstains or refuses as expected',
        config: { answeredInstead, other },
        evaluate(ctx) {
            const expected = ctx.case.expected?.behavior;
            if (!expected)
                return [];
            const observed = options.classify(ctx);
            if (observed === expected)
                return [check(id, 'behavior', 'pass', other, observed)];
            const severity = observed === 'answer' ? answeredInstead : other;
            return [check(id, 'behavior', 'fail', severity, `${observed} instead of ${expected}`, { expected, observed })];
        },
        summarize(cases) {
            const counts = new Map();
            let expectedDecline = 0;
            let declinedCorrectly = 0;
            let declined = 0;
            let n = 0;
            let matched = 0;
            for (const c of cases) {
                const k = c.checks.find((x) => x.criterion === 'behavior');
                if (!k)
                    continue;
                n++;
                if (k.status === 'pass')
                    matched++;
                const expected = c.case.expected.behavior;
                const observed = k.status === 'pass' ? expected : (k.details?.observed ?? 'answer');
                counts.set(`${expected}->${observed}`, (counts.get(`${expected}->${observed}`) ?? 0) + 1);
                const expDecline = expected !== 'answer';
                const obsDecline = observed !== 'answer';
                if (expDecline)
                    expectedDecline++;
                if (obsDecline)
                    declined++;
                if (expDecline && obsDecline)
                    declinedCorrectly++;
            }
            const table = {
                title: 'Behavior (rows: expected, columns: observed)',
                columns: ['Expected \\ Observed', ...BEHAVIORS],
                rows: BEHAVIORS.map((e) => [e, ...BEHAVIORS.map((o) => counts.get(`${e}->${o}`) ?? 0)]),
            };
            return {
                metrics: [
                    ratio(`${id}.match_rate`, matched, n),
                    ratio(`${id}.decline_recall`, declinedCorrectly, expectedDecline, 'of cases that should abstain or refuse, how many did'),
                    ratio(`${id}.decline_precision`, declinedCorrectly, declined, 'of cases where the system abstained or refused, how many should have'),
                ],
                tables: [table],
            };
        },
    };
}
