// Kagami OS app client. Copy this whole file to the top of your entry script.
// It is plain JavaScript with JSDoc types, so `// @ts-check` and editors work
// with no build step. Everything it does is a message to the shell; the shell
// decides what's allowed (see docs/app-sdk.md).

/**
 * @typedef {{ id: string, name: string, type: "file" | "folder", mimeType?: string, size: number, modifiedAt: number }} KagamiEntry
 * @typedef {{ id: string, name: string, mimeType?: string, size: number, bytes: ArrayBuffer, isText: boolean }} KagamiFile
 * @typedef {{ id: string, name: string, size: number, modifiedAt: number }} KagamiWriteResult
 * @typedef {{ appId: string, dataFolderId: string | null, fileId: string | null }} KagamiAppInfo
 * @typedef {{ label: string, appCommand: string, shortcut?: string, disabled?: boolean, dividerAfter?: boolean }} KagamiMenuItem
 * @typedef {{ title: string, items: KagamiMenuItem[] }} KagamiMenuSection
 * @typedef {"capability_denied" | "invalid_request" | "not_found" | "internal"} KagamiErrorCode
 */

/** Thrown by every call the shell refuses or fails. `code` says why. */
class KagamiError extends Error {
  /** @param {KagamiErrorCode} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "KagamiError";
    this.code = code;
  }
}

const kagami = (() => {
  let nextId = 0;
  /** @type {Map<string, (response: any) => void>} */
  const pending = new Map();
  /** @type {Array<(command: string) => void>} */
  const commandHandlers = [];

  // Only the shell (our parent window) is trusted. A frame's own origin is
  // opaque, so identity is the check, never `event.origin`.
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent)
      return;
    const message = event.data;
    if (!message)
      return;
    if (message.kind === "kagami.sandbox.response") {
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    }
    else if (message.kind === "kagami.sandbox.event" && message.type === "appCommand") {
      for (const handler of commandHandlers)
        handler(message.command);
    }
  });

  /**
   * One request out, one answer back. Resolves with the method's data, or
   * rejects with a `KagamiError`.
   * @param {string} method
   * @param {unknown} [params]
   * @returns {Promise<any>} The method's data.
   */
  function call(method, params) {
    const id = `app-${++nextId}`;
    return new Promise((resolve, reject) => {
      pending.set(id, (response) => {
        if (response.ok)
          resolve(response.data);
        else
          reject(new KagamiError(response.error.code, response.error.message));
      });
      window.parent.postMessage({ kind: "kagami.sandbox.request", id, method, params }, "*");
    });
  }

  return {
    call,

    /** Who and what this window is: its data folder, and the file it was opened with. @returns {Promise<KagamiAppInfo>} Ids of this window's data folder and file. */
    info: () => call("app.info"),

    fs: {
      /** Needs `fs.read:<folder or file id>`. Bytes arrive as an ArrayBuffer. @returns {Promise<KagamiFile>} The file. */
      read: (/** @type {string} */ id) => call("fs.read", { id }),
      /** Needs `fs.read:<folder id or an ancestor>`. One level, folders first. @returns {Promise<KagamiEntry[]>} The folder's children. */
      list: (/** @type {string} */ id) => call("fs.list", { id }),
      /** Needs `fs.write:<folder id or an ancestor>`. Replaces a same-named file. @returns {Promise<KagamiWriteResult>} The written file. */
      write: (/** @type {string} */ parentId, /** @type {string} */ name, /** @type {string} */ content, /** @type {string} */ mimeType) =>
        call("fs.write", { parentId, name, content, mimeType }),
      /** Needs `fs.write:<an ancestor of id>`. Moves it to the Trash. @returns {Promise<null>} Resolves when done. */
      delete: (/** @type {string} */ id) => call("fs.delete", { id }),
      /**
       * No capability: the user picks in a dialog the shell draws, and this
       * window can then read that one file. Resolves `null` if they cancel.
       * `accept` is a list like `["text/*", "application/json"]`.
       * @returns {Promise<KagamiEntry | null>} The chosen file, or null.
       */
      pick: (/** @type {string[]} */ accept) => call("fs.pick", accept ? { accept } : {}),
      /** `fs.read`, decoded as UTF-8. @returns {Promise<string>} The file's text. */
      readText: async (/** @type {string} */ id) => new TextDecoder().decode((await call("fs.read", { id })).bytes),
    },

    /** Needs the `notifications` capability. */
    notify: (/** @type {string} */ title, /** @type {string} */ body) => call("notifications.notify", { title, body }),

    /** No capability. Sets this window's title. */
    setTitle: (/** @type {string} */ title) => call("window.setTitle", { title }),

    /**
     * No capability. Replaces the menus shown while this window is focused;
     * `[]` goes back to none. Choosing an item (or its chord) calls the
     * handler registered with `onCommand`, with the item's `appCommand`.
     */
    setMenus: (/** @type {KagamiMenuSection[]} */ sections) => call("menus.set", { sections }),

    /** No capability. A few characters (or a count) on the dock tile; `null` clears it. */
    setBadge: (/** @type {string | number | null} */ badge) => call("dock.setBadge", { badge }),

    /** Registers a handler for menu commands. Several handlers are all called. */
    onCommand: (/** @type {(command: string) => void} */ handler) => {
      commandHandlers.push(handler);
    },
  };
})();

// --- Scratchpad: the app itself ---------------------------------------------
// Everything above this line is sdk/kagami-client.js, copied unchanged. Below
// is what an app author writes.
//
// The frame has an opaque origin: no cookies, no storage, no network, and no
// access to the shell's DOM. The only way out is the client's messages, and the
// shell checks each against what the user approved (manifest.json). A call
// outside that rejects with a KagamiError whose `code` is "capability_denied",
// and the user can revoke a capability from Settings > Apps at any time, which
// takes effect on the very next call.
//
// What each call needs:
//   kagami.fs.write / read   "fs.write:documents" / "fs.read:documents"
//   kagami.notify            "notifications"
//   kagami.fs.write / list / read on kagami.info().dataFolderId
//                            nothing: every app owns a private data folder
//   kagami.fs.pick           nothing: the user's choice is the grant
//   kagami.setTitle / setMenus / setBadge / info   nothing

const DOCUMENTS = "documents"; // the id of the seeded Documents folder
const FILE_NAME = "scratchpad.txt";
const DRAFT_NAME = "draft.txt";

// --- The UI -----------------------------------------------------------------
document.body.style.cssText = "font: 13px sans-serif; margin: 0; padding: 16px; background: #fff; color: #222;";

const text = document.createElement("textarea");
text.id = "text";
text.setAttribute("aria-label", "Scratchpad text");
text.style.cssText = "display: block; box-sizing: border-box; width: 100%; height: 120px; margin-bottom: 8px;";

const status = document.createElement("div");
status.id = "status";
status.style.cssText = "margin-top: 8px; font-family: monospace;";

const draftStatus = document.createElement("div");
draftStatus.id = "draft";
draftStatus.style.cssText = "margin-top: 4px; font-family: monospace; color: #666;";

function button(id, label, onClick) {
  const el = document.createElement("button");
  el.id = id;
  el.textContent = label;
  el.style.marginRight = "6px";
  el.addEventListener("click", onClick);
  return el;
}

// Every call can reject: show the outcome either way.
async function run(label, work) {
  try {
    status.textContent = `${label}: ${(await work()) ?? "ok"}`;
  }
  catch (error) {
    status.textContent = `${label}: ${error.code ?? "error"}`;
  }
}

// --- Documents: needs fs.write:documents and fs.read:documents --------------
// The id fs.write returned for our file. A frame has no storage of its own,
// so this lives only as long as the window does.
let fileId = null;
let saves = 0;

function save() {
  return run("save", async () => {
    const written = await kagami.fs.write(DOCUMENTS, FILE_NAME, text.value, "text/plain");
    fileId = written.id;
    await kagami.setBadge(++saves);
  });
}

function load() {
  return run("load", async () => {
    if (!fileId)
      return "save first";
    text.value = await kagami.fs.readText(fileId);
  });
}

const notify = () => run("notify", () => kagami.notify("Scratchpad", "Hello from a third-party app."));

// --- Open a file: no capability; the user chooses in the shell's dialog -----
function open() {
  return run("open", async () => {
    const entry = await kagami.fs.pick(["text/*"]);
    if (!entry)
      return "cancelled";
    text.value = await kagami.fs.readText(entry.id);
  });
}

// --- The private data folder: no capability, survives reloads ----------------
// Autosaves the text as a draft, and restores it when the app next opens.
let dataFolderId = null;
let draftTimer;

async function saveDraft() {
  if (!dataFolderId)
    return;
  try {
    await kagami.fs.write(dataFolderId, DRAFT_NAME, text.value, "text/plain");
    draftStatus.textContent = "draft: saved";
  }
  catch (error) {
    draftStatus.textContent = `draft: ${error.code ?? "error"}`;
  }
}

text.addEventListener("input", () => {
  // Ungated: it only affects this window's own title bar.
  void kagami.setTitle(text.value.split("\n")[0] || "Scratchpad");
  draftStatus.textContent = "draft: unsaved";
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 200);
});

// --- Menus: no capability; items come back through onCommand ----------------
void kagami.setMenus([
  { title: "Draft", items: [{ label: "Clear Draft", appCommand: "draft.clear", shortcut: "⇧⌘K" }] },
]);
kagami.onCommand((command) => {
  if (command === "draft.clear") {
    text.value = "";
    void saveDraft();
  }
});

document.body.append(
  text,
  button("save", "Save", save),
  button("load", "Load", load),
  button("open", "Open…", open),
  button("notify", "Notify", notify),
  status,
  draftStatus,
);

// --- Start up: a file the app was opened with, else the saved draft ---------
void (async () => {
  const info = await kagami.info();
  dataFolderId = info.dataFolderId;
  if (info.fileId) {
    text.value = await kagami.fs.readText(info.fileId);
    return;
  }
  const entries = await kagami.fs.list(dataFolderId);
  const draft = entries.find(entry => entry.name === DRAFT_NAME);
  if (draft)
    text.value = await kagami.fs.readText(draft.id);
})();
