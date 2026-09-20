import { describe, expect, it } from 'vitest';
import { formatPublicValue } from '../worker/src/publishing';

describe('dynamic content formatting', () => {
  it('supports allowlisted text formats and preserves invalid dates', () => {
    expect(formatPublicValue('WebKiln', 'uppercase')).toBe('WEBKILN');
    expect(formatPublicValue('WebKiln', 'lowercase')).toBe('webkiln');
    expect(formatPublicValue('not-a-date', 'date')).toBe('not-a-date');
  });
});
