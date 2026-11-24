import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TargetResponse } from '../types.ts';
import type { TargetInfo } from './suite.ts';

export const RESPONSES_FORMAT = 'ai-eval-responses/1';

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
  dataset?: { id: string; version: string; fingerprint: string };
  responses: Record<string, RecordedResponse>;
}

export function parseResponses(data: unknown, label = 'responses'): ResponsesFile {
  const d = data as Partial<ResponsesFile> | null;
  const problems: string[] = [];
  if (!d || typeof d !== 'object') problems.push('must be a JSON object');
  else {
    if (d.format !== RESPONSES_FORMAT) problems.push(`format must be "${RESPONSES_FORMAT}"`);
    if (d.origin !== 'mock' && d.origin !== 'recorded') problems.push('origin must be "mock" or "recorded"');
    if (!d.responses || typeof d.responses !== 'object' || Array.isArray(d.responses)) problems.push('responses must be an object keyed by case id');
    else
      for (const [id, r] of Object.entries(d.responses)) {
        if (!r || typeof r !== 'object' || (!('output' in r) && !('error' in r))) problems.push(`responses.${id} needs output or error`);
      }
  }
  if (problems.length) throw new Error(`Invalid ${label}:\n  ${problems.join('\n  ')}`);
  return d as ResponsesFile;
}

export function loadResponses(path: string): ResponsesFile {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot read responses ${path}: ${(e as Error).message}`);
  }
  return parseResponses(data, `responses file ${path}`);
}

export function saveResponses(path: string, file: ResponsesFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}
