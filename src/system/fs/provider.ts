import type { FileSystemProvider } from "./types";
import { childrenOf, useFsStore } from "./fsStore";
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

  async writeFile(parentId, name, content, mimeType) {
    const state = await ready();
    return state.createFile(parentId, name, content, mimeType);
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

  async delete(id) {
    const state = await ready();
    if (state.nodes[id]?.parentId === TRASH_ID)
      state.deleteForever(id);
    else state.moveToTrash(id);
  },

  async stat(id) {
    const state = await ready();
    return state.nodes[id] ?? null;
  },
};
