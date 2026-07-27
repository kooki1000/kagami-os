// Step 16a sandbox demo app. Runs inside an opaque-origin
// `<iframe sandbox="allow-scripts">`; loaded as a real same-origin static
// asset (not an inline <script>) because a srcdoc document inherits the
// embedder's CSP, and script-src 'self' would otherwise block inline JS.
//
// Proves four things to the E2E negative-test suite (e2e/sandbox.spec.ts):
// an allowed fs.read, a denied fs.read, an allowed notification, and that
// direct (bridge-bypassing) access to storage/cookies/network all fail.
(function () {
  "use strict";

  let nextRequestId = 0;
  const pending = new Map();

  window.addEventListener("message", (event) => {
    // Authenticate by identity, mirroring the shell's own check: only
    // trust messages from the parent window that embeds this frame.
    if (event.source !== window.parent)
      return;
    const data = event.data;
    if (!data || data.kind !== "kagami.sandbox.response")
      return;
    const resolver = pending.get(data.id);
    if (!resolver)
      return;
    pending.delete(data.id);
    resolver(data);
  });

  function call(method, params) {
    const id = `demo-${++nextRequestId}`;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      window.parent.postMessage({ kind: "kagami.sandbox.request", id, method, params }, "*");
    });
  }

  function setResult(elementId, text) {
    document.getElementById(elementId).textContent = text;
  }

  document.getElementById("read-btn").addEventListener("click", async () => {
    const id = document.getElementById("read-id").value.trim();
    const response = await call("fs.read", { id });
    if (response.ok) {
      const { name, size, isText } = response.data;
      setResult("read-result", `ok: ${name} (${size} bytes, isText=${isText})`);
    }
    else {
      setResult("read-result", `denied: ${response.error.code}: ${response.error.message}`);
    }
  });

  document.getElementById("notify-btn").addEventListener("click", async () => {
    const response = await call("notifications.notify", { title: "Sandbox demo", body: "Hello from inside the sandbox." });
    setResult("notify-result", response.ok ? "ok: fired" : `denied: ${response.error.code}`);
  });

  document.getElementById("escape-btn").addEventListener("click", () => {
    const attempts = [];

    try {
      window.localStorage.setItem("sandbox-escape-probe", "1");
      attempts.push("localStorage: wrote (SANDBOX FAILED)");
    }
    catch (error) {
      attempts.push(`localStorage: blocked (${error.name})`);
    }

    try {
      document.cookie = "sandbox-escape-probe=1";
      attempts.push(document.cookie.includes("sandbox-escape-probe") ? "cookie: wrote (SANDBOX FAILED)" : "cookie: silently ignored");
    }
    catch (error) {
      attempts.push(`cookie: blocked (${error.name})`);
    }

    fetch("/").then(
      () => setResult("escape-result", `${attempts.join(" | ")} | fetch: succeeded (SANDBOX FAILED)`),
      error => setResult("escape-result", `${attempts.join(" | ")} | fetch: blocked (${error.name})`),
    );
  });
})();
