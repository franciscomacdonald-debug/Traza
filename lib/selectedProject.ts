/** Project selection is a navigation preference, never an authorization decision. */
const key = (userId: string) => `traza:selected-project:${userId}`;
export const isUuid = (value: string | null | undefined): value is string =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function getSelectedProject(userId: string): string | null {
  try {
    const id = window.sessionStorage.getItem(key(userId));
    return isUuid(id) ? id : null;
  } catch { return null; }
}
export function saveSelectedProject(userId: string, projectId: string) {
  if (!isUuid(projectId)) return;
  try { window.sessionStorage.setItem(key(userId), projectId); } catch { /* storage optional */ }
}
export function clearSelectedProject(userId: string) {
  try { window.sessionStorage.removeItem(key(userId)); } catch { /* storage optional */ }
}
