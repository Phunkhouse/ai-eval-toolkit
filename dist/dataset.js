import { readFileSync } from 'node:fs';
import { hashValue, sha256 } from './hash.js';
export const DATASET_FORMAT = 'ai-eval-dataset/1';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const RISKS = ['critical', 'high', 'normal', 'low'];
const SPLITS = ['dev', 'holdout'];
const ORIGINS = ['human', 'synthetic', 'production-sample', 'adapted'];
const ANNOTATIONS = ['draft', 'reviewed', 'approved', 'disputed'];
const BEHAVIORS = ['answer', 'abstain', 'refuse'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
export class DatasetError extends Error {
    issues;
    constructor(message, issues) {
        super(`${message}\n${issues.filter((i) => i.level === 'error').map((i) => `  ${i.path}: ${i.message}`).join('\n')}`);
        this.name = 'DatasetError';
        this.issues = issues;
    }
}
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/**
 * Structural validation of a dataset. Errors make the dataset unusable; warnings are reported
 * (for example synthetic expectations nobody has reviewed) but do not stop a run.
 */
export function validateDataset(data) {
    const issues = [];
    const error = (path, message) => issues.push({ level: 'error', path, message });
    const warn = (path, message) => issues.push({ level: 'warning', path, message });
    if (!isObject(data)) {
        error('$', 'dataset must be a JSON object');
        return issues;
    }
    if (data.format !== DATASET_FORMAT)
        error('$.format', `must be "${DATASET_FORMAT}"`);
    if (typeof data.id !== 'string' || !ID_RE.test(data.id))
        error('$.id', 'must be a stable identifier (letters, digits, ".", "_", "-")');
    if (typeof data.version !== 'string' || data.version.trim() === '')
        error('$.version', 'must be a non-empty string; bump it when cases or expectations change');
    if (data.split !== undefined && !SPLITS.includes(data.split))
        error('$.split', `must be one of ${SPLITS.join(', ')}`);
    const datasetSources = new Set();
    if (data.sources !== undefined) {
        if (!Array.isArray(data.sources))
            error('$.sources', 'must be an array');
        else
            data.sources.forEach((s, i) => checkSource(s, `$.sources[${i}]`, datasetSources, error));
    }
    if (!Array.isArray(data.cases) || data.cases.length === 0) {
        error('$.cases', 'must be a non-empty array');
        return issues;
    }
    const ids = new Set();
    let holdout = 0;
    let unreviewedSynthetic = 0;
    data.cases.forEach((c, i) => {
        const p = `$.cases[${i}]`;
        if (!isObject(c)) {
            error(p, 'case must be an object');
            return;
        }
        if (typeof c.id !== 'string' || !ID_RE.test(c.id))
            error(`${p}.id`, 'must be a stable identifier (letters, digits, ".", "_", "-")');
        else if (ids.has(c.id))
            error(`${p}.id`, `duplicate case id "${c.id}"`);
        else
            ids.add(c.id);
        if (!('input' in c) || c.input === undefined)
            error(`${p}.input`, 'is required');
        const caseSources = new Set();
        if (c.sources !== undefined) {
            if (!Array.isArray(c.sources))
                error(`${p}.sources`, 'must be an array');
            else
                c.sources.forEach((s, j) => checkSource(s, `${p}.sources[${j}]`, caseSources, error));
        }
        if (c.sourceRefs !== undefined) {
            if (!Array.isArray(c.sourceRefs))
                error(`${p}.sourceRefs`, 'must be an array of source ids');
            else
                c.sourceRefs.forEach((ref, j) => {
                    if (typeof ref !== 'string' || !datasetSources.has(ref))
                        error(`${p}.sourceRefs[${j}]`, `unknown dataset source "${String(ref)}"`);
                    else if (caseSources.has(ref))
                        error(`${p}.sourceRefs[${j}]`, `"${ref}" is also a case source; ids must be unique per case`);
                    else
                        caseSources.add(ref);
                });
        }
        if (c.expected !== undefined) {
            if (!isObject(c.expected))
                error(`${p}.expected`, 'must be an object');
            else {
                const e = c.expected;
                if (e.behavior !== undefined && !BEHAVIORS.includes(e.behavior))
                    error(`${p}.expected.behavior`, `must be one of ${BEHAVIORS.join(', ')}`);
                if (e.label !== undefined && typeof e.label !== 'string')
                    error(`${p}.expected.label`, 'must be a string');
                if (e.fields !== undefined && !isObject(e.fields))
                    error(`${p}.expected.fields`, 'must be an object');
                if (e.forbidden !== undefined && (!Array.isArray(e.forbidden) || e.forbidden.some((f) => typeof f !== 'string' || f === '')))
                    error(`${p}.expected.forbidden`, 'must be an array of non-empty strings');
                if (e.evidence !== undefined) {
                    if (!Array.isArray(e.evidence))
                        error(`${p}.expected.evidence`, 'must be an array');
                    else
                        e.evidence.forEach((ev, j) => {
                            if (!isObject(ev) || typeof ev.sourceId !== 'string' || typeof ev.quote !== 'string')
                                error(`${p}.expected.evidence[${j}]`, 'needs sourceId and quote strings');
                            else if (!caseSources.has(ev.sourceId))
                                error(`${p}.expected.evidence[${j}].sourceId`, `unknown source "${ev.sourceId}" for this case`);
                        });
                }
                if (e.toolCalls !== undefined) {
                    const t = e.toolCalls;
                    const names = (v) => v === undefined || (Array.isArray(v) && v.every((n) => typeof n === 'string'));
                    if (!isObject(t) || !names(t.required) || !names(t.forbidden))
                        error(`${p}.expected.toolCalls`, 'must be { required?: string[], forbidden?: string[] }');
                }
            }
        }
        else {
            warn(`${p}.expected`, 'no expected outcome; only checks that need none (schema, forbidden patterns) can apply');
        }
        if (c.criteria !== undefined && (!Array.isArray(c.criteria) || c.criteria.some((x) => typeof x !== 'string')))
            error(`${p}.criteria`, 'must be an array of evaluator ids');
        if (c.tags !== undefined && (!Array.isArray(c.tags) || c.tags.some((x) => typeof x !== 'string')))
            error(`${p}.tags`, 'must be an array of strings');
        if (c.risk !== undefined && !RISKS.includes(c.risk))
            error(`${p}.risk`, `must be one of ${RISKS.join(', ')}`);
        if (c.difficulty !== undefined && !DIFFICULTIES.includes(c.difficulty))
            error(`${p}.difficulty`, `must be one of ${DIFFICULTIES.join(', ')}`);
        if (c.split !== undefined && !SPLITS.includes(c.split))
            error(`${p}.split`, `must be one of ${SPLITS.join(', ')}`);
        if ((c.split ?? data.split) === 'holdout')
            holdout++;
        let origin;
        if (c.provenance !== undefined) {
            if (!isObject(c.provenance) || !ORIGINS.includes(c.provenance.origin))
                error(`${p}.provenance.origin`, `must be one of ${ORIGINS.join(', ')}`);
            else
                origin = c.provenance.origin;
        }
        let status;
        if (c.annotation !== undefined) {
            if (!isObject(c.annotation) || !ANNOTATIONS.includes(c.annotation.status))
                error(`${p}.annotation.status`, `must be one of ${ANNOTATIONS.join(', ')}`);
            else
                status = c.annotation.status;
        }
        if (origin === 'synthetic' && status !== 'approved' && c.expected !== undefined)
            unreviewedSynthetic++;
        if (status === 'disputed')
            warn(`${p}.annotation`, 'expectation is disputed; resolve it before treating results on this case as meaningful');
    });
    if (unreviewedSynthetic > 0)
        warn('$.cases', `${unreviewedSynthetic} synthetic case(s) have expectations no human has approved; results on them measure agreement with an unreviewed draft`);
    if (holdout === data.cases.length)
        warn('$.cases', 'every case is holdout; iterate on a dev split and run holdout rarely');
    return issues;
}
function checkSource(s, path, seen, error) {
    if (!isObject(s) || typeof s.id !== 'string' || typeof s.text !== 'string') {
        error(path, 'source needs id and text strings');
        return;
    }
    if (seen.has(s.id))
        error(`${path}.id`, `duplicate source id "${s.id}"`);
    seen.add(s.id);
}
/** Parse and validate a dataset; throws DatasetError on any error. */
export function parseDataset(data) {
    const issues = validateDataset(data);
    if (issues.some((i) => i.level === 'error'))
        throw new DatasetError('Invalid dataset', issues);
    return { dataset: data, warnings: issues.filter((i) => i.level === 'warning') };
}
export function loadDataset(path) {
    let data;
    try {
        data = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch (e) {
        throw new DatasetError(`Cannot read dataset ${path}: ${e.message}`, []);
    }
    return parseDataset(data);
}
/** The case's own sources followed by any dataset-level sources it references. */
export function resolveSources(dataset, c) {
    const own = c.sources ?? [];
    const refs = (c.sourceRefs ?? []).map((ref) => dataset.sources?.find((s) => s.id === ref)).filter((s) => !!s);
    return [...own, ...refs];
}
export function caseSplit(dataset, c) {
    return c.split ?? dataset.split ?? 'dev';
}
/**
 * Hash of what a case measures: input, resolved sources, expectations and criteria. Metadata
 * (tags, annotation, provenance, notes) is excluded, so approving a case does not break comparisons.
 */
export function caseHash(dataset, c) {
    return hashValue({ id: c.id, input: c.input, sources: resolveSources(dataset, c), expected: c.expected, criteria: c.criteria });
}
/** Fingerprint of the whole dataset's measured content. */
export function datasetFingerprint(dataset) {
    const hashes = dataset.cases.map((c) => caseHash(dataset, c)).sort();
    return sha256(`${dataset.id}\n${hashes.join('\n')}`).slice(0, 16);
}
