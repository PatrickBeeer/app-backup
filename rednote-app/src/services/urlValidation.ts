// Port of backend/app/services/url_validation.py — behavior-preserving.

const ALLOWED_HOSTS = new Set([
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'xhslink.com',
  'www.xhslink.com',
  'xhslink.cn',
  'www.xhslink.cn',
  'xiaohongshu.cn',
  'www.xiaohongshu.cn',
]);

const XHS_SHORT_LINK_HOSTS = new Set([
  'xhslink.com',
  'www.xhslink.com',
  'xhslink.cn',
  'www.xhslink.cn',
]);

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isIpAddress(host: string): boolean {
  if (IPV4_PATTERN.test(host)) {
    return host.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
  }
  // bracketed or bare IPv6
  const bare = host.replace(/^\[|\]$/g, '');
  return bare.includes(':') && /^[0-9a-fA-F:]+$/.test(bare);
}

export function validateXhsUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('请输入有效的小红书链接');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('请输入有效的小红书链接');
  }
  if (!parsed.hostname) {
    throw new Error('请输入有效的小红书链接');
  }
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (isIpAddress(host)) {
    throw new Error('不允许 IP 地址');
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error('仅支持小红书官方链接或 xhslink 短链接');
  }
  if (parsed.username || parsed.password) {
    throw new Error('链接不能包含认证信息');
  }
  return value;
}

export function extractXhsNoteId(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (XHS_SHORT_LINK_HOSTS.has(parsed.hostname.toLowerCase().replace(/\.+$/, ''))) {
    return null;
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'discovery' && parts[1] === 'item') {
    return parts[2];
  }
  for (const marker of ['explore', 'discovery', 'item']) {
    if (parts.includes(marker)) {
      const index = parts.indexOf(marker);
      if (index + 1 < parts.length) {
        return parts[index + 1];
      }
    }
  }
  return parts.length ? parts[parts.length - 1] : null;
}
