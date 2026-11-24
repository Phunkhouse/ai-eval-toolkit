import type { Metric } from '../types.ts';
/** 95% Wilson score interval; better behaved than the normal approximation for small n and extreme rates. */
export declare function wilsonInterval(successes: number, n: number, z?: number): [number, number] | undefined;
/** A ratio metric with its numerator and denominator; `null` when the denominator is zero. */
export declare function ratio(name: string, numerator: number, denominator: number, note?: string): Metric;
export declare function count(name: string, value: number, note?: string): Metric;
export declare function round(x: number, digits?: number): number;
/** Nearest-rank percentile of a list of numbers; undefined for an empty list. */
export declare function percentile(values: number[], p: number): number | undefined;
export declare function formatRatio(m: Pick<Metric, 'value' | 'numerator' | 'denominator'>): string;
