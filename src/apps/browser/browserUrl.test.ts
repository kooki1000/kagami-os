import { describe, expect, it } from "vitest";
import { connectionSecurity, hostnameOf, normalizeAddress } from "./browserUrl";
import { searchEngineById } from "./searchEngines";

const google = searchEngineById("google");
const ddg = searchEngineById("duckduckgo");

describe("normalizeAddress — addresses", () => {
  it("returns null for empty or whitespace-only input", () => {
    expect(normalizeAddress("", google)).toBeNull();
    expect(normalizeAddress("   ", google)).toBeNull();
  });

  it("keeps an explicit https URL", () => {
    expect(normalizeAddress("https://example.com/path?q=1", google))
      .toBe("https://example.com/path?q=1");
  });

  it("keeps an explicit http URL rather than upgrading it", () => {
    expect(normalizeAddress("http://example.com", google)).toBe("http://example.com/");
  });

  it("infers https for a bare hostname — the case that used to fail silently", () => {
    expect(normalizeAddress("example.com", google)).toBe("https://example.com/");
  });

  it("infers https for a bare hostname with a path", () => {
    expect(normalizeAddress("example.com/docs/index.html", google))
      .toBe("https://example.com/docs/index.html");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(normalizeAddress("  example.com  ", google)).toBe("https://example.com/");
  });

  it("infers https for a bare IPv4 address", () => {
    expect(normalizeAddress("93.184.216.34", google)).toBe("https://93.184.216.34/");
  });

  it("keeps about: and file: URLs", () => {
    expect(normalizeAddress("about:blank", google)).toBe("about:blank");
    expect(normalizeAddress("file:///Users/x/page.html", google)).toBe("file:///Users/x/page.html");
  });
});

describe("normalizeAddress — host:port, which reads as a scheme", () => {
  it("treats localhost:PORT as a host, not a `localhost:` scheme", () => {
    expect(normalizeAddress("localhost:5173", google)).toBe("http://localhost:5173/");
  });

  it("uses http for loopback so the guess doesn't land on a cert error", () => {
    expect(normalizeAddress("localhost", google)).toBe("http://localhost/");
    expect(normalizeAddress("127.0.0.1:8080", google)).toBe("http://127.0.0.1:8080/");
  });

  it("uses https for a non-loopback host:port", () => {
    expect(normalizeAddress("example.com:8443/admin", google)).toBe("https://example.com:8443/admin");
  });
});

describe("normalizeAddress — search fallback", () => {
  it("searches for plain words", () => {
    expect(normalizeAddress("kagami os", google))
      .toBe("https://www.google.com/search?q=kagami%20os");
  });

  it("searches for a single word with no dot", () => {
    expect(normalizeAddress("weather", google)).toBe("https://www.google.com/search?q=weather");
  });

  it("searches for dotted text containing spaces", () => {
    expect(normalizeAddress("see example.com for details", google))
      .toBe("https://www.google.com/search?q=see%20example.com%20for%20details");
  });

  it("uses the engine it is given", () => {
    expect(normalizeAddress("kagami os", ddg)).toBe("https://duckduckgo.com/?q=kagami%20os");
  });

  it("percent-encodes characters that would otherwise alter the query", () => {
    expect(normalizeAddress("a&b=c", google)).toBe("https://www.google.com/search?q=a%26b%3Dc");
  });
});

describe("normalizeAddress — schemes that must not be navigated to", () => {
  it("searches for javascript: instead of running it against the current origin", () => {
    const result = normalizeAddress("javascript:alert(1)", google);
    expect(result).toBe("https://www.google.com/search?q=javascript%3Aalert(1)");
    expect(result?.startsWith("https://")).toBe(true);
  });

  it("searches for data: URLs", () => {
    expect(normalizeAddress("data:text/html,<h1>hi</h1>", google)?.startsWith("https://www.google.com/search"))
      .toBe(true);
  });

  it("searches for an unparseable but scheme-shaped input", () => {
    expect(normalizeAddress("https://", google)?.startsWith("https://www.google.com/search")).toBe(true);
  });
});

describe("hostnameOf", () => {
  it("returns the bare host of a URL", () => {
    expect(hostnameOf("https://www.example.com/a/b?c=1")).toBe("www.example.com");
  });

  it("falls back to the raw string when there is no parseable URL", () => {
    expect(hostnameOf("not a url")).toBe("not a url");
  });

  it("falls back to the raw string for a hostless URL", () => {
    expect(hostnameOf("about:blank")).toBe("about:blank");
  });
});

describe("connectionSecurity", () => {
  it("reports https as secure", () => {
    expect(connectionSecurity("https://example.com")).toBe("secure");
  });

  it("reports plaintext http as insecure", () => {
    expect(connectionSecurity("http://example.com")).toBe("insecure");
  });

  it("does not flag loopback http, which is plaintext by design", () => {
    expect(connectionSecurity("http://localhost:5173")).toBe("neutral");
    expect(connectionSecurity("http://127.0.0.1:8080")).toBe("neutral");
  });

  it("reports schemes where the distinction does not apply as neutral", () => {
    expect(connectionSecurity("about:blank")).toBe("neutral");
    expect(connectionSecurity("file:///tmp/x.html")).toBe("neutral");
    expect(connectionSecurity("garbage")).toBe("neutral");
  });
});
