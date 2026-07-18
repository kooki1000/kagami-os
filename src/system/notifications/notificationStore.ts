import { create } from "zustand";

export type NotificationTone = "default" | "accent" | "danger";

export interface NotificationAction {
  label: string;
  run: () => void;
}

export interface KagamiNotification {
  id: string;
  title: string;
  body?: string;
  /** Source app id, used to show its dock-tile glyph on the notification. */
  appId?: string;
  tone: NotificationTone;
  createdAt: number;
  read: boolean;
  action?: NotificationAction;
}

export interface NotifyInput {
  title: string;
  body?: string;
  appId?: string;
  tone?: NotificationTone;
  action?: NotificationAction;
}

const HISTORY_LIMIT = 50;

interface NotificationStore {
  items: KagamiNotification[];
  /** Ids currently visible as toasts (a subset of `items`). */
  toastIds: string[];
  centerOpen: boolean;
  notify: (input: NotifyInput) => string;
  dismissToast: (id: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  openCenter: () => void;
  closeCenter: () => void;
  markAllRead: () => void;
}

let counter = 0;

export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  items: [],
  toastIds: [],
  centerOpen: false,

  notify: (input) => {
    const id = `ntf-${++counter}`;
    const notification: KagamiNotification = {
      id,
      title: input.title,
      body: input.body,
      appId: input.appId,
      tone: input.tone ?? "default",
      createdAt: Date.now(),
      // If the center is open, it's already visible — mark it read.
      read: get().centerOpen,
      action: input.action,
    };
    set((state) => {
      const items = [notification, ...state.items].slice(0, HISTORY_LIMIT);
      // Don't pile up toasts when the center is open.
      const toastIds = state.centerOpen ? state.toastIds : [...state.toastIds, id];
      // Trimming to HISTORY_LIMIT can evict an item a toast id still points
      // at; those ids render nothing and would otherwise accumulate for the
      // life of the session.
      const live = new Set(items.map(n => n.id));
      return { items, toastIds: toastIds.filter(t => live.has(t)) };
    });
    return id;
  },

  dismissToast: id =>
    set(state => ({ toastIds: state.toastIds.filter(t => t !== id) })),

  remove: id =>
    set(state => ({
      items: state.items.filter(n => n.id !== id),
      toastIds: state.toastIds.filter(t => t !== id),
    })),

  clearAll: () => set({ items: [], toastIds: [] }),

  openCenter: () =>
    set(state => ({
      centerOpen: true,
      toastIds: [],
      items: state.items.map(n => ({ ...n, read: true })),
    })),

  closeCenter: () => set({ centerOpen: false }),

  markAllRead: () =>
    set(state => ({ items: state.items.map(n => ({ ...n, read: true })) })),
}));

/** Convenience for non-component callers (e.g. `openFile`, stores). */
export function notify(input: NotifyInput): string {
  return useNotificationStore.getState().notify(input);
}

export function selectUnreadCount(state: NotificationStore): number {
  return state.items.reduce((n, item) => (item.read ? n : n + 1), 0);
}
