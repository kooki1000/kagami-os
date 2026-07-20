import type { FileSystemProvider } from "./types";
import { childrenOf, isDescendantOf, useFsStore } from "./fsStore";
import { TRASH_ID } from "./types";

async function ready() {
  await useFsStore.getState().init();
  return useFsStore.getState();
}

/**
 * Async, storage-agnostic file system API. Apps that don't need reactive
 * updates (e.g. the Terminal) program against this instead of the store.
 */
export const fileSystem: FileSystemProvider = {
  async readDir(id) {
    const state = await ready();
    if (state.nodes[id]?.type !== "folder")
      throw new Error(`Not a folder: ${id}`);
    return childrenOf(state.nodes, id);
  },

  async readFile(id) {
    const state = await ready();
    const node = state.nodes[id];
    if (!node || node.type !== "file")
      throw new Error(`Not a file: ${id}`);
    return node;
  },

  /**
   * Replaces a same-named file rather than forking one: `createFile` runs the
   * name through `uniqueChildName`, so delegating straight to it would turn
   * every save of "note.txt" into "note 2.txt", "note 3.txt", …
   */
  async writeFile(parentId, name, content, mimeType) {
    const state = await ready();
    const existing = childrenOf(state.nodes, parentId).find(
      n => n.type === "file" && n.name.toLowerCase() === name.toLowerCase(),
    );
    if (!existing)
      return state.createFile(parentId, name, content, mimeType);
    state.updateFileContent(existing.id, content);
    // Re-read: `updateFileContent` commits a new node object.
    return useFsStore.getState().nodes[existing.id];
  },

  async mkdir(parentId, name) {
    const state = await ready();
    return state.createFolder(parentId, name);
  },

  async move(id, newParentId) {
    const state = await ready();
    if (!state.move(id, newParentId))
      throw new Error(`Cannot move ${id} into ${newParentId}`);
  },

  async rename(id, newName) {
    const state = await ready();
    state.rename(id, newName);
  },

  /**
   * Trash the node, or delete it permanently if already trashed. Tests the
   * whole subtree, not just direct children of Trash: nested items would
   * otherwise be re-trashed, relocating them and losing `trashedFrom`.
   */
  async delete(id) {
    const state = await ready();
    if (isDescendantOf(state.nodes, id, TRASH_ID))
      state.deleteForever(id);
    else state.moveToTrash(id);
  },

  async stat(id) {
    const state = await ready();
    return state.nodes[id] ?? null;
  },
};
