// Scratchpad — the reference third-party app for Kagami OS.
//
// It runs inside a sandboxed iframe with an opaque origin: no cookies, no
// storage, no network, and no access to the shell's DOM. The only way out is
// postMessage to the shell, which checks every request against the
// capabilities the user approved (see manifest.json). A call outside them
// isn't an exception here: the shell answers with ok:false and a
// "capability_denied" error, and the user can revoke a capability at any time
// from Settings > Apps, taking effect on the very next call.
//
// This file exercises every bridge method an app is likely to want:
//   fs.write              (capability "fs.write:documents")
//   fs.read               (capability "fs.read:documents")
//   notifications.notify  (capability "notifications")
//   window.setTitle       (no capability needed)

const DOCUMENTS = "documents"; // the id of the seeded Documents folder
const FILE_NAME = "scratchpad.txt";

// --- The bridge client -----------------------------------------------------
// One request out, one response back, matched on `id`. The shell only ever
// replies to this frame's own window, and we only trust `window.parent`.
let nextId = 0;
const pending = new Map();

window.addEventListener("message", (event) => {
  if (event.source !== window.parent)
    return;
  const message = event.data;
  if (!message || message.kind !== "kagami.sandbox.response")
    return;
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
});

function call(method, params) {
  const id = `scratchpad-${++nextId}`;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    window.parent.postMessage({ kind: "kagami.sandbox.request", id, method, params }, "*");
  });
}

// --- The UI ----------------------------------------------------------------
document.body.style.cssText = "font: 13px sans-serif; margin: 0; padding: 16px; background: #fff; color: #222;";

const text = document.createElement("textarea");
text.id = "text";
text.setAttribute("aria-label", "Scratchpad text");
text.style.cssText = "display: block; box-sizing: border-box; width: 100%; height: 120px; margin-bottom: 8px;";

const status = document.createElement("div");
status.id = "status";
status.style.cssText = "margin-top: 8px; font-family: monospace;";

function button(id, label, onClick) {
  const el = document.createElement("button");
  el.id = id;
  el.textContent = label;
  el.style.marginRight = "6px";
  el.addEventListener("click", onClick);
  return el;
}

// The id fs.write returned for our file. A frame has no storage of its own,
// so this lives only as long as the window does.
let fileId = null;

// Every bridge call resolves, never throws: show the outcome either way.
function report(label, response) {
  status.textContent = response.ok ? `${label}: ok` : `${label}: ${response.error.code}`;
}

async function save() {
  const response = await call("fs.write", { parentId: DOCUMENTS, name: FILE_NAME, content: text.value, mimeType: "text/plain" });
  if (response.ok)
    fileId = response.data.id;
  report("save", response);
}

async function load() {
  if (!fileId) {
    status.textContent = "load: save first";
    return;
  }
  const response = await call("fs.read", { id: fileId });
  if (response.ok)
    text.value = new TextDecoder().decode(response.data.bytes);
  report("load", response);
}

async function notify() {
  report("notify", await call("notifications.notify", { title: "Scratchpad", body: "Hello from a third-party app." }));
}

// Ungated: it only affects this window's own title bar.
text.addEventListener("input", () => {
  void call("window.setTitle", { title: text.value.split("\n")[0] || "Scratchpad" });
});

document.body.append(text, button("save", "Save", save), button("load", "Load", load), button("notify", "Notify", notify), status);
