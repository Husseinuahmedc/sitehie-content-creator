import type { CanvasGroup, CanvasObject } from "@sitehie/core/domain";

/**
 * Layers data layer — pure helpers over the flat `objects` array +
 * `groups` records. Z-order is array order (no z-index field); the panel
 * displays it reversed (top of list = top of stack, Figma convention).
 * Group membership is a flat `parentId`; members stay contiguous in the
 * array (invariant enforced by grouping/reorder ops) so the export engine's
 * linear render loop needs no structural changes.
 */

/** A row in the Layers panel display tree. */
export type LayerRow = {
  id: string;
  kind: "object" | "group";
  /** 0 = top-level, 1 = group member. */
  depth: number;
  object?: CanvasObject;
  group?: CanvasGroup;
};

const TYPE_LABELS: Record<CanvasObject["type"], string> = {
  rect: "Rectangle",
  circle: "Ellipse",
  polygon: "Polygon",
  path: "Path",
  text: "Text",
};

/** Display name: explicit `name`, else derived from type + per-type index. */
export function layerName(obj: CanvasObject, objects: CanvasObject[]): string {
  if (obj.name) return obj.name;
  const sameType = objects.filter((o) => o.type === obj.type);
  const idx = sameType.findIndex((o) => o.id === obj.id);
  return `${TYPE_LABELS[obj.type]} ${idx + 1}`;
}

export function groupName(group: CanvasGroup, groups: CanvasGroup[]): string {
  if (group.name) return group.name;
  const idx = groups.findIndex((g) => g.id === group.id);
  return `Group ${idx + 1}`;
}

/**
 * Display-order rows for the Layers panel: top of the list = top of the
 * z-stack (END of the objects array). Group members collapse under a group
 * row (emitted at the position of their topmost member).
 */
export function getOrderedLayers(objects: CanvasObject[], groups: CanvasGroup[] = []): LayerRow[] {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const rows: LayerRow[] = [];
  const emittedGroups = new Set<string>();
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    const gid = obj.parentId && groupsById.has(obj.parentId) ? obj.parentId : null;
    if (!gid) {
      rows.push({ id: obj.id, kind: "object", depth: 0, object: obj });
      continue;
    }
    if (emittedGroups.has(gid)) continue;
    emittedGroups.add(gid);
    rows.push({ id: gid, kind: "group", depth: 0, group: groupsById.get(gid)! });
    for (let j = objects.length - 1; j >= 0; j--) {
      if (objects[j].parentId === gid) {
        rows.push({ id: objects[j].id, kind: "object", depth: 1, object: objects[j] });
      }
    }
  }
  return rows;
}

/** Direct members of a group, in z-order. */
export function getChildren(objects: CanvasObject[], groupId: string): CanvasObject[] {
  return objects.filter((o) => o.parentId === groupId);
}

/** True when `id` sits inside `ancestorId` via the parentId chain. */
export function isDescendantOf(
  objects: CanvasObject[],
  id: string,
  ancestorId: string,
  groups: CanvasGroup[] = []
): boolean {
  const byId = new Map<string, { parentId?: string | null }>();
  for (const o of objects) byId.set(o.id, o);
  for (const g of groups) byId.set(g.id, g);
  const seen = new Set<string>();
  let cur = byId.get(id)?.parentId ?? null;
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false; // cycle guard
    seen.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return false;
}

/** Effective visibility incl. group ancestors (dangling parentId ignored). */
export function isEffectivelyVisible(obj: CanvasObject, groups: CanvasGroup[] = []): boolean {
  if (obj.visible === false) return false;
  if (obj.parentId) {
    const g = groups.find((gr) => gr.id === obj.parentId);
    if (g && g.visible === false) return false;
  }
  return true;
}

/** Effective lock state incl. group ancestors (dangling parentId ignored). */
export function isEffectivelyLocked(obj: CanvasObject, groups: CanvasGroup[] = []): boolean {
  if (obj.locked === true) return true;
  if (obj.parentId) {
    const g = groups.find((gr) => gr.id === obj.parentId);
    if (g && g.locked === true) return true;
  }
  return false;
}

/**
 * Move `activeId` to the array position of `overId` (dnd-kit drop semantics
 * mapped through the reversed display order). Returns the new z-ordered
 * objects array.
 */
export function reorderObjects(objects: CanvasObject[], activeId: string, overId: string): CanvasObject[] {
  const from = objects.findIndex((o) => o.id === activeId);
  const to = objects.findIndex((o) => o.id === overId);
  if (from < 0 || to < 0 || from === to) return objects;
  const next = [...objects];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Block-aware reorder that preserves group contiguity (the export engine's
 * linear render loop depends on members staying contiguous in the array).
 *
 * - Dragging a group row moves the whole block (group + all members).
 * - Dragging a group member only reorders it within its own group's block;
 *   dropping outside the block is a no-op (ungroup first to move freely).
 * - Dragging an ungrouped object moves it to the over target's array slot.
 */
export function reorderLayers(
  objects: CanvasObject[],
  groups: CanvasGroup[],
  activeId: string,
  overId: string
): CanvasObject[] {
  const rows = getOrderedLayers(objects, groups);
  const blockOf = (rowId: string): { start: number; end: number } | null => {
    const i = rows.findIndex((r) => r.id === rowId);
    if (i < 0) return null;
    if (rows[i].kind === "group") {
      let j = i + 1;
      while (j < rows.length && rows[j].depth === 1) j++;
      return { start: i, end: j - 1 };
    }
    return { start: i, end: i };
  };
  const ab = blockOf(activeId);
  const ob = blockOf(overId);
  if (!ab || !ob || ab.start === ob.start) return objects;
  // Dropping a block onto one of its own members = no-op.
  if (ob.start >= ab.start && ob.start <= ab.end) return objects;

  const activeRow = rows[ab.start];
  const overRow = rows[ob.start];
  // Member rows can only reorder within their group's display block.
  if (activeRow.kind === "object" && activeRow.depth === 1) {
    const inSameGroup =
      overRow.kind === "object" && overRow.depth === 1 && overRow.object?.parentId === activeRow.object?.parentId;
    if (!inSameGroup) return objects;
  }

  const nextRows = [...rows];
  const block = nextRows.splice(ab.start, ab.end - ab.start + 1);
  let obStart = ob.start;
  if (ob.start > ab.start) obStart -= ab.end - ab.start + 1;
  nextRows.splice(Math.max(0, obStart), 0, ...block);

  // Reconstruct the z-ordered objects array from display order (reverse).
  const objOrder = nextRows.filter((r) => r.kind === "object").map((r) => r.id);
  const byId = new Map(objects.map((o) => [o.id, o]));
  return objOrder.slice().reverse().map((id) => byId.get(id)!);
}

/**
 * Move `memberIds` into a contiguous block ending at the topmost member's
 * position, then set their `parentId` to `groupId`. Preserves the relative
 * order of members and the z-position of everything around them.
 */
export function applyGroup(
  objects: CanvasObject[],
  memberIds: string[],
  groupId: string
): CanvasObject[] {
  const members = objects.filter((o) => memberIds.includes(o.id));
  if (members.length === 0) return objects;
  const idxs = members.map((m) => objects.indexOf(m));
  const top = Math.max(...idxs);
  const sortedMembers = [...members].sort((a, b) => objects.indexOf(a) - objects.indexOf(b));
  const others = objects.filter((o) => !memberIds.includes(o.id));
  const next = [...others.slice(0, top), ...sortedMembers, ...others.slice(top)];
  return next.map((o) => (memberIds.includes(o.id) ? ({ ...o, parentId: groupId } as CanvasObject) : o));
}

/** Remove `memberIds` from their groups and prune now-empty groups. */
export function applyUngroup(
  objects: CanvasObject[],
  groups: CanvasGroup[] | undefined,
  memberIds: string[]
): { objects: CanvasObject[]; groups: CanvasGroup[] | undefined } {
  const affected = new Set(memberIds);
  const groupIds = new Set(objects.filter((o) => affected.has(o.id) && o.parentId).map((o) => o.parentId!));
  const nextObjects = objects.map((o) => (affected.has(o.id) ? ({ ...o, parentId: null } as CanvasObject) : o));
  const nextGroups = groups?.filter((g) => !groupIds.has(g.id) || nextObjects.some((o) => o.parentId === g.id));
  return { objects: nextObjects, groups: nextGroups === groups ? groups : nextGroups };
}

/** Drop group records that have no remaining members. */
export function pruneEmptyGroups(objects: CanvasObject[], groups: CanvasGroup[] | undefined): CanvasGroup[] | undefined {
  if (!groups?.length) return groups;
  const next = groups.filter((g) => objects.some((o) => o.parentId === g.id));
  return next.length === groups.length ? groups : next;
}
