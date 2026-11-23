import { describe, expect, it } from 'vitest';
import { isValidIdempotencyKey, taskInputSchema, validateAttachment } from './task-input.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);

describe('taskInputSchema', () => {
  it('accepts a full task and trims the title', () => {
    const result = taskInputSchema.parse({
      title: '  Bug report: crash  ',
      description: 'text',
      priority: 'HIGH',
      labelIds: ['l1'],
      externalUserRef: 'a1B2-c3_d4',
    });
    expect(result.title).toBe('Bug report: crash');
  });

  it.each([
    ['a blank title', { title: '   ' }],
    ['a long title', { title: 'x'.repeat(201) }],
    ['an unknown priority', { title: 't', priority: 'SOON' }],
    ['an unknown field', { title: 't', status: 'DONE' }],
    ['an externalUserRef with other characters', { title: 't', externalUserRef: 'a b' }],
    ['too many labels', { title: 't', labelIds: Array.from({ length: 21 }, (_, i) => `l${i}`) }],
  ])('rejects %s', (_name, input) => {
    expect(taskInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('validateAttachment', () => {
  it('accepts a PNG and a JPEG and names them itself', async () => {
    const png = await validateAttachment(
      new File([PNG], '../../etc/passwd', { type: 'image/png' }),
      0,
    );
    const jpeg = await validateAttachment(new File([JPEG], 'x', { type: 'image/jpeg' }), 1);
    expect(png).toMatchObject({ mimeType: 'image/png', filename: 'attachment-1.png' });
    expect(jpeg).toMatchObject({ mimeType: 'image/jpeg', filename: 'attachment-2.jpg' });
  });

  it.each([
    ['another type', new File([PNG], 'a.svg', { type: 'image/svg+xml' }), 'must be image/png'],
    ['an empty file', new File([], 'a.png', { type: 'image/png' }), 'is empty'],
    [
      'bytes that are not a PNG',
      new File([JPEG], 'a.png', { type: 'image/png' }),
      'not a valid PNG',
    ],
    [
      'a file over 10 MB',
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }),
      'over 10 MB',
    ],
  ])('rejects %s', async (_name, file, message) => {
    expect(await validateAttachment(file, 0)).toContain(message);
  });
});

describe('isValidIdempotencyKey', () => {
  it('takes 1-100 printable ASCII characters', () => {
    expect(isValidIdempotencyKey('cut-bug-report:3f9a')).toBe(true);
    expect(isValidIdempotencyKey(null)).toBe(false);
    expect(isValidIdempotencyKey('')).toBe(false);
    expect(isValidIdempotencyKey('has space')).toBe(false);
    expect(isValidIdempotencyKey('x'.repeat(101))).toBe(false);
  });
});
