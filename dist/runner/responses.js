import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export const RESPONSES_FORMAT = 'ai-eval-responses/1';
export function parseResponses(data, label = 'responses') {
    const d = data;
    const problems = [];
    if (!d || typeof d !== 'object')
        problems.push('must be a JSON object');
    else {
        if (d.format !== RESPONSES_FORMAT)
            problems.push(`format must be "${RESPONSES_FORMAT}"`);
        if (d.origin !== 'mock' && d.origin !== 'recorded')
            problems.push('origin must be "mock" or "recorded"');
        if (!d.responses || typeof d.responses !== 'object' || Array.isArray(d.responses))
            problems.push('responses must be an object keyed by case id');
        else
            for (const [id, r] of Object.entries(d.responses)) {
                if (!r || typeof r !== 'object' || (!('output' in r) && !('error' in r)))
                    problems.push(`responses.${id} needs output or error`);
            }
    }
    if (problems.length)
        throw new Error(`Invalid ${label}:\n  ${problems.join('\n  ')}`);
    return d;
}
export function loadResponses(path) {
    let data;
    try {
        data = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch (e) {
        throw new Error(`Cannot read responses ${path}: ${e.message}`);
    }
    return parseResponses(data, `responses file ${path}`);
}
export function saveResponses(path, file) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}
