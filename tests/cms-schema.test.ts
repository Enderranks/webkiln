import { describe, expect, it } from 'vitest';
import {
  CMS_FIELD_TYPES,
  clampCmsPage,
  clampCmsPageSize,
  sanitizeCmsRichText,
} from '../src/models/cms-schema';

describe('CMS schema safeguards', () => {
  it('supports the typed field catalog and strips unsafe rich text', () => {
    expect(CMS_FIELD_TYPES).toContain('reference');
    expect(
      sanitizeCmsRichText('<p>Hello</p><script>alert(1)</script><a onclick="bad()">Link</a>'),
    ).toBe('<p>Hello</p><a>Link</a>');
  });
  it('bounds pagination values', () => {
    expect(clampCmsPage(0)).toBe(1);
    expect(clampCmsPage(99999)).toBe(10000);
    expect(clampCmsPageSize(99999)).toBe(100);
    expect(clampCmsPageSize('bad')).toBe(25);
  });
});
