/** JSON with object keys sorted, so equal values always hash equally. `undefined` properties are dropped. */
export declare function canonicalJson(value: unknown): string;
export declare function sha256(text: string): string;
/** Short, stable content hash of any JSON value. */
export declare function hashValue(value: unknown): string;
