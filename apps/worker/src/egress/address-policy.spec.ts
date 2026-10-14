import { describe, expect, it } from '@jest/globals';

import { isPublicAddress } from './address-policy.js';

describe('isPublicAddress', () => {
  it.each([
    ['1.1.1.1', 'public DNS resolver'],
    ['93.184.215.14', 'public web server'],
    ['8.8.8.8', 'public DNS resolver'],
    ['2606:4700:4700::1111', 'public IPv6'],
    ['2a00:1450:4007:80e::200e', 'public IPv6'],
  ])('accepts %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    ['10.0.0.1', 'private, RFC 1918'],
    ['10.255.255.255', 'private, RFC 1918'],
    ['172.16.0.1', 'private, RFC 1918'],
    ['172.31.255.254', 'private, RFC 1918'],
    ['192.168.1.1', 'private, RFC 1918'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['169.254.169.254', 'cloud metadata endpoint, link-local'],
    ['169.254.0.1', 'link-local'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'unspecified'],
    ['0.1.2.3', '"this network"'],
    ['255.255.255.255', 'broadcast'],
    ['224.0.0.1', 'multicast'],
    ['192.0.2.1', 'documentation, TEST-NET-1'],
    ['198.51.100.1', 'documentation, TEST-NET-2'],
    ['203.0.113.1', 'documentation, TEST-NET-3'],
    ['198.18.0.1', 'benchmarking'],
    ['240.0.0.1', 'reserved'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique local'],
    ['fd12:3456:789a::1', 'IPv6 unique local'],
    ['ff02::1', 'IPv6 multicast'],
    ['2001:db8::1', 'IPv6 documentation'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata endpoint'],
    ['64:ff9b::a00:1', 'NAT64 carrying 10.0.0.1'],
    ['2002:a00:1::1', '6to4 carrying 10.0.0.1'],
    ['2001::1', 'Teredo'],
  ])('refuses %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '',
    'localhost',
    'example.com',
    '256.1.1.1',
    '1.1.1',
    '0x7f.1',
    '017700000001',
    'fe80::1%eth0',
    '::ffff:1.1.1.1:80',
  ])('refuses %j, which is not an IP address', (value) => {
    expect(isPublicAddress(value)).toBe(false);
  });
});
