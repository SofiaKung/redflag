import { describe, expect, it } from 'vitest';
import { getRegistrableDomain } from './linkIntelligence';

describe('getRegistrableDomain', () => {
  it('reduces long subdomain hosts to a registrable root', () => {
    const host = 'bw-winelist-website-prod.s3-website-us-west-2.amazonaws.com';
    expect(getRegistrableDomain(host)).toBe('amazonaws.com');
  });

  it('handles common multi-part public suffixes', () => {
    const host = 'secure.login.example.co.uk';
    expect(getRegistrableDomain(host)).toBe('example.co.uk');
  });

  it('returns IP addresses unchanged', () => {
    expect(getRegistrableDomain('127.0.0.1')).toBe('127.0.0.1');
  });
});
