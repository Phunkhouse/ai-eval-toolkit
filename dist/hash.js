import { createHash } from 'node:crypto';
/** JSON with object keys sorted, so equal values always hash equally. `undefined` properties are dropped. */
export function canonicalJson(value) {
    return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
    if (Array.isArray(value))
        return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            const v = value[key];
            if (v !== undefined)
                out[key] = sortKeys(v);
        }
        return out;
    }
    return value;
}
export function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
}
/** Short, stable content hash of any JSON value. */
export function hashValue(value) {
    return sha256(canonicalJson(value)).slice(0, 16);
}
