/**
 * Client/server-safe fetch with AbortController timeout.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 */
export function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}
