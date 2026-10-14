import { describe, expect, it } from '@jest/globals';

import { hostHeader, parseForwardRequest, parseTunnelTarget } from './target.js';

describe('parseForwardRequest', () => {
  it('reads the host, the port and the path with its query string', () => {
    expect(parseForwardRequest('http://Example.COM/a/b?x=1#frag')).toEqual({
      ok: true,
      value: { target: { hostname: 'example.com', port: 80 }, path: '/a/b?x=1' },
    });
    expect(parseForwardRequest('http://example.com:8080/')).toMatchObject({
      value: { target: { port: 8080 } },
    });
  });

  it.each([
    ['http://2130706433/', '127.0.0.1'],
    ['http://0x7f.1/', '127.0.0.1'],
    ['http://017700000001/', '127.0.0.1'],
    ['http://0251.0376.0251.0376/', '169.254.169.254'],
    ['http://[::ffff:a9fe:a9fe]/', '::ffff:a9fe:a9fe'],
    ['http://[::1]:80/', '::1'],
    ['http://example.com./', 'example.com'],
    ['http://bücher.example/', 'xn--bcher-kva.example'],
  ])('normalises the host of %s to %s, as a browser would', (url, hostname) => {
    expect(parseForwardRequest(url)).toMatchObject({ ok: true, value: { target: { hostname } } });
  });

  it.each([
    ['/relative/path', 'not an absolute URL'],
    ['https://example.com/', 'https: scheme is not allowed'],
    ['ftp://example.com/', 'ftp: scheme is not allowed'],
    ['file:///etc/passwd', 'file: scheme is not allowed'],
    ['gopher://example.com/', 'gopher: scheme is not allowed'],
    ['http://user:secret@example.com/', 'credentials in the URL'],
  ])('refuses %s', (url, reason) => {
    expect(parseForwardRequest(url)).toEqual({
      ok: false,
      reason: expect.stringContaining(reason),
    });
  });
});

describe('parseTunnelTarget', () => {
  it('reads a host and a port', () => {
    expect(parseTunnelTarget('example.com:443')).toEqual({
      ok: true,
      value: { hostname: 'example.com', port: 443 },
    });
    expect(parseTunnelTarget('[2606:4700::1111]:443')).toEqual({
      ok: true,
      value: { hostname: '2606:4700::1111', port: 443 },
    });
    expect(parseTunnelTarget('example.com:80')).toMatchObject({ value: { port: 80 } });
  });

  it('normalises numeric IPv4 forms', () => {
    expect(parseTunnelTarget('2130706433:443')).toMatchObject({ value: { hostname: '127.0.0.1' } });
  });

  it.each([
    'example.com',
    'example.com:',
    'user@example.com:443',
    'example.com:443/path',
    'http://example.com:443',
    'exa mple.com:443',
    '[::1:443',
    'example.com:999999',
  ])('refuses %j', (authority) => {
    expect(parseTunnelTarget(authority).ok).toBe(false);
  });
});

describe('hostHeader', () => {
  it('omits the default port and brackets IPv6 addresses', () => {
    expect(hostHeader({ hostname: 'example.com', port: 80 })).toBe('example.com');
    expect(hostHeader({ hostname: 'example.com', port: 443 })).toBe('example.com:443');
    expect(hostHeader({ hostname: '2606:4700::1111', port: 80 })).toBe('[2606:4700::1111]');
  });
});
