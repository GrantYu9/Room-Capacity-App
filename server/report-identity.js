import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './validation.js';
import { isIP } from 'node:net';

export function networkKey(address) {
  const ip = address?.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1');
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) throw new ApiError(503, 'Community reporting is temporarily unavailable.');
  const [head, tail] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail !== undefined ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  // Rotating IPv6 privacy addresses in one /64 share a rate-limit bucket.
  return `${groups.slice(0, 4).map(part => parseInt(part, 16).toString(16)).join(':')}::/64`;
}

export function reportIdentity(req, res, config) {
  if (!config.reportSecret || config.reportSecret.length < 32) throw new ApiError(503, 'Community reporting is temporarily unavailable.');
  const hash = text => createHmac('sha256', config.reportSecret).update(text).digest('hex');
  const cookie = /(?:^|;\s*)room_reporter=([a-f0-9]{48})\.([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '');
  let id = cookie?.[1];
  if (!id || !timingSafeEqual(Buffer.from(cookie[2], 'hex'), Buffer.from(hash(`cookie:${id}`), 'hex'))) {
    id = randomBytes(24).toString('hex');
    res.setHeader('Set-Cookie', `room_reporter=${id}.${hash(`cookie:${id}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${config.trustVercel ? '; Secure' : ''}`);
  }
  // Trust the platform's overwritten IP header only on Vercel. Client supplied
  // X-Forwarded-For is ignored by the local server. Store keyed hashes only.
  const ip = config.trustVercel ? req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim() : req.socket?.remoteAddress;
  if (!ip) throw new ApiError(503, 'Community reporting is temporarily unavailable.');
  return { reporter_hash: hash(`browser:${id}`), network_hash: hash(`network:${networkKey(ip)}`) };
}
