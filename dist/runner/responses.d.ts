import type { TargetResponse } from '../types.ts';
import type { TargetInfo } from './suite.ts';
export declare const RESPONSES_FORMAT = "ai-eval-responses/1";
export interface RecordedResponse extends TargetResponse {
    /** The target failed for this case; the run reports it as errored. */
    error?: string;
}
/**
 * Responses for offline runs. `mock` responses are written by hand to exercise the evaluators and
 * report; `recorded` responses were captured from a live run. Neither is fresh evidence.
 */
export interface ResponsesFile {
    format: typeof RESPONSES_FORMAT;
    origin: 'mock' | 'recorded';
    description?: string;
    recordedAt?: string;
    target?: TargetInfo;
    dataset?: {
        id: string;
        version: string;
        fingerprint: string;
    };
    responses: Record<string, RecordedResponse>;
}
export declare function parseResponses(data: unknown, label?: string): ResponsesFile;
export declare function loadResponses(path: string): ResponsesFile;
export declare function saveResponses(path: string, file: ResponsesFile): void;
