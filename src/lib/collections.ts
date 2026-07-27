/** Finds `list[i]` where `id` matches, falling back to `list[0]` for an unknown id. */
export function findByIdOr<T extends { id: string }>(list: T[], id: string): T {
  return list.find(item => item.id === id) ?? list[0];
}
