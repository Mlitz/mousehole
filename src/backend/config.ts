import { version } from "../../package.json";

function environmentOrFallback<T>(
  name: string,
  fallback: T,
  mapFunction?: (s: string) => T
): T {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  if (mapFunction) {
    return mapFunction(value);
  }
  return value as T;
}

export const config = {
  /**
   * The user agent string to use for HTTP requests.
   *
   * Defaults to "mousehole-by-timtimtim".
   */
  userAgent: environmentOrFallback(
    "MOUSEHOLE_USER_AGENT",
    `mousehole-by-timtimtim/${version}`
  ),

  /**
   * The directory path where Mousehole stores its state.
   *
   * Defaults to "/srv/mousehole".
   */
  stateDirPath: environmentOrFallback(
    "MOUSEHOLE_STATE_DIR_PATH",
    "/srv/mousehole"
  ),

  /**
   * The number of seconds between checks of the host's IP. If the IP has
   * changed, a request to MAM will be performed.
   *
   * Defaults to 300 seconds (5 minutes).
   */
  checkIntervalSeconds: environmentOrFallback(
    "MOUSEHOLE_CHECK_INTERVAL_SECONDS",
    5 * 60, // 5 minutes
    (value) => Number.parseFloat(value)
  ),

  /**
   * The number of seconds after which to consider a response stale. After this
   * time, on the next check, a request to MAM will be performed even if the
   * host's IP has not changed.
   *
   * Defaults to 86400 seconds (1 day).
   */
  staleResponseSeconds: environmentOrFallback(
    "MOUSEHOLE_STALE_RESPONSE_SECONDS",
    60 * 60 * 24, // 1 day
    (value) => Number.parseFloat(value)
  ),

  /**
   * The port on which the Mousehole server will listen.
   *
   * Defaults to 5010.
   */
  port: environmentOrFallback("MOUSEHOLE_PORT", 5010, (value) =>
    Number.parseInt(value)
  ),

  /**
   * Enable SOCKS5 proxy for outbound HTTP requests.
   *
   * Defaults to false.
   */
  enableSocks5Proxy: environmentOrFallback(
    "MOUSEHOLE_ENABLE_SOCKS5_PROXY",
    false,
    (value) => value.toLowerCase() === "yes" || value.toLowerCase() === "true"
  ),

  /**
   * SOCKS5 proxy hostname/IP address.
   *
   * Required when enableSocks5Proxy is true.
   */
  socks5Host: environmentOrFallback("MOUSEHOLE_SOCKS5_HOST", ""),

  /**
   * SOCKS5 proxy port.
   *
   * Required when enableSocks5Proxy is true.
   */
  socks5Port: environmentOrFallback("MOUSEHOLE_SOCKS5_PORT", 1080, (value) =>
    Number.parseInt(value)
  ),

  /**
   * SOCKS5 proxy username (optional authentication).
   */
  socks5User: environmentOrFallback("MOUSEHOLE_SOCKS5_USER", ""),

  /**
   * SOCKS5 proxy password (optional authentication).
   */
  socks5Pass: environmentOrFallback("MOUSEHOLE_SOCKS5_PASS", ""),
};