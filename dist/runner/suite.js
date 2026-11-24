export function defineSuite(suite) {
    if (!suite.id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(suite.id))
        throw new Error(`Suite id must be a stable identifier: ${suite.id}`);
    if (!suite.version)
        throw new Error(`Suite ${suite.id} needs a version`);
    if (!Array.isArray(suite.evaluators) || suite.evaluators.length === 0)
        throw new Error(`Suite ${suite.id} needs at least one evaluator`);
    const ids = suite.evaluators.map((e) => e.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup)
        throw new Error(`Suite ${suite.id}: duplicate evaluator id "${dup}"`);
    return suite;
}
export function parseAsIs(raw) {
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === ''))
        return { ok: false, reason: 'empty', message: 'output is empty' };
    return { ok: true, value: raw };
}
