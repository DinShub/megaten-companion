import { convertToParamMap } from '@angular/router';

import { parseInt10, parseList, serializeList } from './url-query';

describe('url-query helpers', () => {
  it('parses a comma-separated list, de-duplicated', () => {
    expect(parseList(convertToParamMap({ k: 'a,b,c' }), 'k')).toEqual(['a', 'b', 'c']);
    expect(parseList(convertToParamMap({ k: 'a,a,b' }), 'k')).toEqual(['a', 'b']);
    expect(parseList(convertToParamMap({}), 'k')).toEqual([]);
    expect(parseList(convertToParamMap({ k: '' }), 'k')).toEqual([]);
  });

  it('serializes a list, null when empty', () => {
    expect(serializeList(['a', 'b'])).toBe('a,b');
    expect(serializeList([])).toBeNull();
  });

  it('parses a bounded integer, null when absent or invalid', () => {
    expect(parseInt10(convertToParamMap({ n: '42' }), 'n')).toBe(42);
    expect(parseInt10(convertToParamMap({ n: 'abc' }), 'n')).toBeNull();
    expect(parseInt10(convertToParamMap({}), 'n')).toBeNull();
  });
});
