import { describe, expect, it } from 'vitest';
import { isSafeNextPath } from './safe-next-path';

describe('isSafeNextPath', () => {
  it('accepts /admin', () => {
    expect(isSafeNextPath('/admin')).toBe(true);
  });

  it('accepts /admin/account', () => {
    expect(isSafeNextPath('/admin/account')).toBe(true);
  });

  it('accepts a nested /admin/** path', () => {
    expect(isSafeNextPath('/admin/some/nested/route')).toBe(true);
  });

  it('rejects a bare absolute external URL', () => {
    expect(isSafeNextPath('https://evil.example.com')).toBe(false);
  });

  it('rejects a protocol-relative URL (//evil.example.com)', () => {
    expect(isSafeNextPath('//evil.example.com')).toBe(false);
  });

  it('rejects the backslash protocol-relative bypass (/\\evil.example.com)', () => {
    expect(isSafeNextPath('/\\evil.example.com')).toBe(false);
  });

  it('rejects a path that merely starts with the string "/admin" but is a different route', () => {
    expect(isSafeNextPath('/adminx')).toBe(false);
    expect(isSafeNextPath('/admin-panel')).toBe(false);
  });

  it('rejects a path outside /admin entirely', () => {
    expect(isSafeNextPath('/some-other-page')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSafeNextPath('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isSafeNextPath(undefined)).toBe(false);
    expect(isSafeNextPath(null)).toBe(false);
    expect(isSafeNextPath(['/admin'])).toBe(false);
    expect(isSafeNextPath(42)).toBe(false);
  });

  it('rejects a value containing embedded credentials/userinfo aimed at another host', () => {
  expect(isSafeNextPath('/admin@evil.example.com')).toBe(false);
  expect(isSafeNextPath('https://admin:pw@evil.example.com/admin')).toBe(false);
  });

  it('rejects path traversal that resolves outside /admin', () => {
    expect(isSafeNextPath('/admin/../../evil')).toBe(false);
  });

  it('accepts path traversal that still resolves under /admin', () => {
    expect(isSafeNextPath('/admin/account/../account')).toBe(true);
  });
});
