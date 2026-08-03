import type { SearchEngine } from "./searchEngines";
import { searchUrlFor } from "./searchEngines";

/**
 * Turning what the user typed into something the child webview can be pointed
 * at (U17).
 *
 * Before this, the address bar sent its raw input straight to
 * `browser_navigate`, where `parse_url` rejected anything without a scheme —
 * so typing `example.com` failed, and failed *silently* (the rejection was
 * only `console.error`'d). Every input now resolves to some URL: a real one
 * when it looks like an address, a search otherwise.
 */

/**
 * Schemes the address bar will navigate to. `javascript:` and `data:` are
 * deliberately absent — pasting either into an address bar is the classic
 * self-XSS delivery route, and here it would run against whatever origin the
 * child webview currently holds. Anything not on this list is treated as
 * search text, which is both safer and usually what was meant.
 */
const NAVIGABLE_SCHEMES = new Set(["http:", "https:", "file:", "about:"]);

/** Anything shaped like `scheme:`, so an explicit scheme can be told from a bare host. */
const SCHEME_RE = /^[a-z][\w+.-]*:/i;

/**
 * `host:port` — which also matches `^scheme:` and would otherwise be read as a
 * scheme we don't navigate to (`localhost:5173` parses as protocol
 * `localhost:`), sending every dev server to the search engine. Checked first
 * for that reason; a real scheme is followed by `//`, never by digits.
 */
const HOST_PORT_RE = /^[a-z0-9.-]+:\d+(?:[/?#]|$)/i;

/** A dotted hostname whose last label reads like a TLD, e.g. `example.com`, `a.b.co.uk`. */
const DOTTED_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

/** Bare IPv4, or bracketed IPv6 as a URL authority spells it. */
const IP_HOST_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\])$/i;

/**
 * Hosts that are almost never reachable over TLS, so guessing `https` for them
 * lands on a certificate error instead of the dev server the user meant.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

function parseAbsolute(candidate: string): URL | null {
  try {
    return new URL(candidate);
  }
  catch {
    return null;
  }
}

/** The authority of a scheme-less input — everything before the first `/`, `?` or `#`. */
function authorityOf(input: string): string {
  return input.split(/[/?#]/, 1)[0];
}

function looksLikeHost(input: string): boolean {
  if (/\s/.test(input))
    return false;
  const authority = authorityOf(input).replace(/:\d+$/, "");
  return authority === "localhost"
    || IP_HOST_RE.test(authority)
    || DOTTED_HOST_RE.test(authority);
}

/** Loopback gets `http`, everything else `https` — see {@link LOOPBACK_HOSTS}. */
function schemeFor(input: string): string {
  const host = authorityOf(input).replace(/:\d+$/, "").toLowerCase();
  return LOOPBACK_HOSTS.has(host) ? "http" : "https";
}

/**
 * What the address bar should navigate to for `input`, or `null` if there is
 * nothing to navigate to (empty input).
 *
 * Order matters: `host:port` is checked before the scheme test, because the
 * two are textually ambiguous (see {@link HOST_PORT_RE}).
 */
export function normalizeAddress(input: string, engine: SearchEngine): string | null {
  const trimmed = input.trim();
  if (!trimmed)
    return null;

  if (HOST_PORT_RE.test(trimmed)) {
    const guessed = parseAbsolute(`${schemeFor(trimmed)}://${trimmed}`);
    if (guessed)
      return guessed.href;
  }

  if (SCHEME_RE.test(trimmed)) {
    const explicit = parseAbsolute(trimmed);
    // An unparseable but scheme-shaped input (`https://`) falls through to
    // search rather than erroring — same outcome as any other unusable text.
    if (explicit)
      return NAVIGABLE_SCHEMES.has(explicit.protocol) ? explicit.href : searchUrlFor(engine, trimmed);
    return searchUrlFor(engine, trimmed);
  }

  if (looksLikeHost(trimmed)) {
    const guessed = parseAbsolute(`${schemeFor(trimmed)}://${trimmed}`);
    if (guessed)
      return guessed.href;
  }

  return searchUrlFor(engine, trimmed);
}

/**
 * Narrows an untrusted value to a URL the Browser is allowed to open, or
 * `null`. Used on anything that didn't come from the webview itself — a
 * restored session payload is JSON from localStorage, which a user (or
 * anything else with page-origin access) can edit, and `javascript:` reaching
 * `browser_navigate` would run against the child webview's current origin.
 */
export function navigableUrl(value: unknown): string | null {
  if (typeof value !== "string")
    return null;
  const parsed = parseAbsolute(value);
  return parsed && NAVIGABLE_SCHEMES.has(parsed.protocol) ? parsed.href : null;
}

/**
 * Bare host for the standby state and the window title, falling back to the
 * raw string for anything that isn't a parseable absolute URL.
 */
export function hostnameOf(rawUrl: string): string {
  return parseAbsolute(rawUrl)?.hostname || rawUrl;
}

/**
 * Connection security for the address bar's leading indicator: `secure` for
 * TLS, `insecure` for plaintext HTTP, `neutral` for anything where the
 * distinction doesn't apply (`about:`, `file:`, an unparseable URL).
 */
export type ConnectionSecurity = "secure" | "insecure" | "neutral";

export function connectionSecurity(rawUrl: string): ConnectionSecurity {
  const parsed = parseAbsolute(rawUrl);
  if (!parsed)
    return "neutral";
  if (parsed.protocol === "https:")
    return "secure";
  if (parsed.protocol === "http:")
    // Loopback is plaintext by design, not by neglect — flagging the dev
    // server the user just started as insecure is noise.
    return LOOPBACK_HOSTS.has(parsed.hostname) ? "neutral" : "insecure";
  return "neutral";
}
