import { describe, expect, it } from 'vitest';
import { caseHash, datasetFingerprint, parseDataset, validateDataset } from '../src/index.ts';
import { dataset } from './helpers.ts';

const errors = (d: unknown) => validateDataset(d).filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`);

describe('dataset validation', () => {
  it('accepts a minimal dataset', () => {
    expect(errors(dataset([{ id: 'A-1', input: 'hi', expected: { label: 'x' } }]))).toEqual([]);
  });

  it('rejects wrong format, duplicate ids, missing input and unknown references', () => {
    const d = {
      format: 'other',
      id: 'bad id',
      version: '',
      sources: [{ id: 'policy', text: 'p' }],
      cases: [
        { id: 'A-1', input: 'x', sourceRefs: ['nope'] },
        { id: 'A-1', input: 'y' },
        { id: 'A-2' },
        { id: 'A-3', input: 'z', sources: [{ id: 'doc', text: 't' }], expected: { evidence: [{ sourceId: 'elsewhere', quote: 'q' }], behavior: 'maybe' } },
      ],
    };
    const e = errors(d);
    expect(e).toContain('$.format: must be "ai-eval-dataset/1"');
    expect(e.some((x) => x.startsWith('$.id:'))).toBe(true);
    expect(e.some((x) => x.startsWith('$.version:'))).toBe(true);
    expect(e).toContain('$.cases[0].sourceRefs[0]: unknown dataset source "nope"');
    expect(e).toContain('$.cases[1].id: duplicate case id "A-1"');
    expect(e).toContain('$.cases[2].input: is required');
    expect(e).toContain('$.cases[3].expected.evidence[0].sourceId: unknown source "elsewhere" for this case');
    expect(e.some((x) => x.startsWith('$.cases[3].expected.behavior'))).toBe(true);
  });

  it('warns about unreviewed synthetic expectations but does not reject them', () => {
    const d = dataset([{ id: 'S-1', input: 'x', expected: { label: 'a' }, provenance: { origin: 'synthetic' }, annotation: { status: 'draft' } }]);
    const issues = validateDataset(d);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('synthetic'))).toBe(true);
    expect(() => parseDataset(d)).not.toThrow();
  });

  it('throws a DatasetError listing every error', () => {
    expect(() => parseDataset({ format: 'ai-eval-dataset/1', id: 'x', version: '1', cases: [] })).toThrow(/cases: must be a non-empty array/);
  });
});

describe('case hashes', () => {
  const base = dataset([{ id: 'A-1', input: 'x', expected: { label: 'a' }, tags: ['t'], annotation: { status: 'draft' } }]);

  it('ignore metadata such as tags and annotation status', () => {
    const approved = dataset([{ ...base.cases[0]!, tags: ['other'], annotation: { status: 'approved', reviewer: 'lead' } }]);
    expect(caseHash(approved, approved.cases[0]!)).toBe(caseHash(base, base.cases[0]!));
    expect(datasetFingerprint(approved)).toBe(datasetFingerprint(base));
  });

  it('change when the expectation, input or a referenced source changes', () => {
    const relabelled = dataset([{ ...base.cases[0]!, expected: { label: 'b' } }]);
    expect(caseHash(relabelled, relabelled.cases[0]!)).not.toBe(caseHash(base, base.cases[0]!));
    const withRef = (text: string) => dataset([{ id: 'A-1', input: 'x', sourceRefs: ['p'] }], { sources: [{ id: 'p', text }] });
    const a = withRef('one');
    const b = withRef('two');
    expect(caseHash(a, a.cases[0]!)).not.toBe(caseHash(b, b.cases[0]!));
  });
});
