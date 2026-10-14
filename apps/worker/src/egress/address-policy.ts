import ipaddr from 'ipaddr.js';

/**
 * Whether the scan engine may connect to this IP address.
 *
 * Only ordinary public unicast addresses pass. Everything else is refused:
 * private networks, loopback, link-local (including the cloud metadata
 * endpoint 169.254.169.254), carrier-grade NAT, multicast, documentation and
 * reserved ranges, and the IPv6 forms that can carry an IPv4 address (mapped,
 * NAT64, 6to4, Teredo). An allowlist is safer than a blocklist here: a range
 * nobody thought of is refused rather than allowed.
 *
 * Only canonical forms are accepted: a dotted quad for IPv4 ("1.1.1" or
 * "0x7f.1" are refused, although some resolvers read them as addresses) and a
 * standard IPv6 address. Anything else is refused as well.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.IPv4.isValidFourPartDecimal(address) && !ipaddr.IPv6.isValid(address)) {
    return false;
  }
  // process() turns an IPv4-mapped IPv6 address (::ffff:10.0.0.1) into its IPv4 form.
  return ipaddr.process(address).range() === 'unicast';
}
