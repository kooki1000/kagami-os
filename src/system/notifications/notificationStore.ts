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
  /**
   * When this notification's toast should auto-dismiss. Stamped at creation
   * regardless of whether it's currently rendered as a toast — ownership of
   * "when does this expire" belongs to the store, not to a `Toast`
   * component's mount lifecycle (review-backlog.md §3 / T4). Irrelevant once
   * the id has left `toastIds`.
   */
  expiresAt: number;
}

export interface NotifyInput {
  title: string;
  body?: string;
  appId?: string;
  tone?: NotificationTone;
  action?: NotificationAction;
}

const HISTORY_LIMIT = 50;

/** How long a toast stays on screen before it auto-dismisses. */
export const TOAST_TTL_MS = 5000;

interface NotificationStore {
  items: KagamiNotification[];
  /** Ids currently visible as toasts (a subset of `items`). */
  toastIds: string[];
  centerOpen: boolean;
  notify: (input: NotifyInput) => string;
  dismissToast: (id: string) => void;
  /** Drop any toast id whose `expiresAt` has passed — store-owned eviction, independent of whether it's mounted. */
  pruneExpiredToasts: (now?: number) => void;
  /** Suspend a toast's countdown (e.g. while the pointer hovers it). */
  pauseToast: (id: string) => void;
  /** Restart a paused toast's countdown from now. */
  resumeToast: (id: string) => void;
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
    const now = Date.now();
    const notification: KagamiNotification = {
      id,
      title: input.title,
      body: input.body,
      appId: input.appId,
      tone: input.tone ?? "default",
      createdAt: now,
      // If the center is open, it's already visible — mark it read.
      read: get().centerOpen,
      action: input.action,
      expiresAt: now + TOAST_TTL_MS,
    };
    set((state) => {
      const items = [notification, ...state.items].slice(0, HISTORY_LIMIT);
      // Don't pile up toasts when the center is open.
      const toastIds = state.centerOpen ? state.toastIds : [...state.toastIds, id];
      // The HISTORY_LIMIT trim can evict an item a toast id points at; those
      // ids render nothing and would accumulate for the whole session.
      const live = new Set(items.map(n => n.id));
      return { items, toastIds: toastIds.filter(t => live.has(t)) };
    });
    return id;
  },

  dismissToast: id =>
    set(state => ({ toastIds: state.toastIds.filter(t => t !== id) })),

  pruneExpiredToasts: (now = Date.now()) =>
    set((state) => {
      const byId = new Map(state.items.map(n => [n.id, n]));
      const toastIds = state.toastIds.filter((id) => {
        const notification = byId.get(id);
        return notification !== undefined && notification.expiresAt > now;
      });
      return toastIds.length === state.toastIds.length ? state : { toastIds };
    }),

  pauseToast: id =>
    set(state => ({
      items: state.items.map(n => (n.id === id ? { ...n, expiresAt: Number.POSITIVE_INFINITY } : n)),
    })),

  resumeToast: id =>
    set(state => ({
      items: state.items.map(n => (n.id === id ? { ...n, expiresAt: Date.now() + TOAST_TTL_MS } : n)),
    })),

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
