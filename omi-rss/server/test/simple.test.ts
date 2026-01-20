import { describe, it, expect } from '@jest/globals';

describe('Simple Test', () => {
  it('should pass basic math', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle strings', () => {
    expect('hello' + ' world').toBe('hello world');
  });
});