import { config } from "#backend/config.ts";

/**
 * Gets fetch options with optional SOCKS5 proxy configuration.
 * When SOCKS5 proxy is disabled, returns the original options unchanged.
 * When enabled, adds proxy configuration while preserving all other options.
 */
export function getFetchOptions(options: RequestInit = {}): RequestInit {
  if (!config.enableSocks5Proxy) {
    return options;
  }

  // Validate proxy configuration when enabled
  if (!config.socks5Host) {
    throw new Error("MOUSEHOLE_SOCKS5_HOST is required when SOCKS5 proxy is enabled");
  }

  // Build SOCKS5 proxy URL
  let proxyUrl = `socks5://${config.socks5Host}:${config.socks5Port}`;

  // Add authentication if provided
  if (config.socks5User && config.socks5Pass) {
    proxyUrl = `socks5://${config.socks5User}:${config.socks5Pass}@${config.socks5Host}:${config.socks5Port}`;
  }

  return {
    ...options,
    // @ts-ignore - Bun supports proxy option but TypeScript doesn't know about it
    proxy: proxyUrl,
  };
}