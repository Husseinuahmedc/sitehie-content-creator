"use client";

import { useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CanvasGroup, CanvasObject } from "@sitehie/core/domain";
import Icon from "./Icon";
import {
  getOrderedLayers,
  groupName,
  isEffectivelyLocked,
  isEffectivelyVisible,
  layerName,
  type LayerRow,
} from "@/lib/layers";

/* ── Types ─────────────────────────────────────────────────────────────── */

type Props = {
  objects: CanvasObject[];
  groups: CanvasGroup[];
  selectedIds: string[];
  onSelect: (id: string | null, additive?: boolean) => void;
  onReorder: (activeId: string, overId: string) => void;
  onPatchObject: (id: string, patch: Partial<CanvasObject>) => void;
  onPatchGroup: (id: string, patch: Partial<CanvasGroup>) => void;
};

const TYPE_ICONS: Record<CanvasObject["type"], string> = {
  rect: "▭",
  circle: "◯",
  polygon: "△",
  path: "✎",
  text: "T",
};

/* ── Main component ────────────────────────────────────────────────────── */

export default function LayersPanel({
  objects,
  groups,
  selectedIds,
  onSelect,
  onReorder,
  onPatchObject,
  onPatchGroup,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const rows = useMemo(() => getOrderedLayers(objects, groups), [objects, groups]);
  // Hide members of panel-collapsed groups (display-only collapse).
  const visibleRows = useMemo(
    () => rows.filter((r) => r.depth === 0 || !r.object?.parentId || !collapsedGroups.has(r.object.parentId)),
    [rows, collapsedGroups]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };

  const commitRename = (row: LayerRow) => {
    const name = draft.trim();
    if (name) {
      if (row.kind === "group") onPatchGroup(row.id, { name });
      else onPatchObject(row.id, { name });
    }
    setEditingId(null);
  };

  const toggleGroupCollapsed = (gid: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: "6px 10px", background: "none", border: "none", cursor: "pointer",
          fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        <Icon name="layers" size={13} />
        <span>Layers</span>
        <span style={{ fontWeight: 400 }}>({objects.length})</span>
        <span style={{ marginLeft: "auto" }}>
          <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={12} />
        </span>
      </button>

      {!collapsed && (
        <div style={{ maxHeight: 180, overflowY: "auto", padding: "0 4px 6px" }}>
          {visibleRows.length === 0 && (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-muted)" }}>
              No layers yet — add a shape to get started.
            </div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visibleRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {visibleRows.map((row) => (
                <LayerRowView
                  key={row.id}
                  row={row}
                  objects={objects}
                  groups={groups}
                  selected={selectedIds.includes(row.id)}
                  groupCollapsed={row.kind === "group" && collapsedGroups.has(row.id)}
                  editing={editingId === row.id}
                  draft={draft}
                  onDraftChange={setDraft}
                  onSelect={onSelect}
                  onStartRename={(r) => {
                    setEditingId(r.id);
                    setDraft(r.kind === "group" ? groupName(r.group!, groups) : layerName(r.object!, objects));
                  }}
                  onCommitRename={commitRename}
                  onCancelRename={() => setEditingId(null)}
                  onToggleGroupCollapsed={toggleGroupCollapsed}
                  onPatchObject={onPatchObject}
                  onPatchGroup={onPatchGroup}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

/* ── Row ───────────────────────────────────────────────────────────────── */

type RowProps = {
  row: LayerRow;
  objects: CanvasObject[];
  groups: CanvasGroup[];
  selected: boolean;
  groupCollapsed: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onSelect: (id: string | null, additive?: boolean) => void;
  onStartRename: (row: LayerRow) => void;
  onCommitRename: (row: LayerRow) => void;
  onCancelRename: () => void;
  onToggleGroupCollapsed: (gid: string) => void;
  onPatchObject: (id: string, patch: Partial<CanvasObject>) => void;
  onPatchGroup: (id: string, patch: Partial<CanvasGroup>) => void;
};

function LayerRowView({
  row, objects, groups, selected, groupCollapsed, editing, draft,
  onDraftChange, onSelect, onStartRename, onCommitRename, onCancelRename,
  onToggleGroupCollapsed, onPatchObject, onPatchGroup,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });

  const isGroup = row.kind === "group";
  const obj = row.object;
  const visible = isGroup ? row.group!.visible !== false : isEffectivelyVisible(obj!, groups);
  const locked = isGroup ? row.group!.locked === true : isEffectivelyLocked(obj!, groups);
  const name = isGroup ? groupName(row.group!, groups) : layerName(obj!, objects);

  const toggleVisible = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGroup) onPatchGroup(row.id, { visible: !(row.group!.visible !== false) });
    else onPatchObject(row.id, { visible: obj!.visible === false });
  };
  const toggleLocked = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGroup) onPatchGroup(row.id, { locked: !(row.group!.locked === true) });
    else onPatchObject(row.id, { locked: !(obj!.locked === true) });
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        display: "flex", alignItems: "center", gap: 6,
        padding: "3px 6px",
        paddingLeft: 6 + row.depth * 16,
        borderRadius: 6,
        background: selected ? "var(--accent-dim)" : "transparent",
        cursor: "default",
        fontSize: 12,
      }}
      onClick={(e) => {
        if (isGroup) onToggleGroupCollapsed(row.id);
        else onSelect(row.id, e.shiftKey);
      }}
      {...attributes}
      {...listeners}
    >
      {/* Type icon / group chevron */}
      {isGroup ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleGroupCollapsed(row.id); }}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", width: 20, height: 20, padding: 0 }}
          title={groupCollapsed ? "Expand group" : "Collapse group"}
          aria-label={groupCollapsed ? "Expand group" : "Collapse group"}
        >
          <Icon name={groupCollapsed ? "chevronRight" : "chevronDown"} size={11} />
        </button>
      ) : (
        <span style={{ width: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
          {TYPE_ICONS[obj!.type]}
        </span>
      )}

      {/* Name (double-click to rename) */}
      {editing ? (
        <input
          className="control"
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={() => onCommitRename(row)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename(row);
            if (e.key === "Escape") onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ flex: 1, fontSize: 12, padding: "1px 6px", minWidth: 0 }}
        />
      ) : (
        <span
          onDoubleClick={(e) => { e.stopPropagation(); onStartRename(row); }}
          style={{
            flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            opacity: visible ? 1 : 0.45,
            fontWeight: isGroup ? 600 : 400,
          }}
          title="Double-click to rename"
        >
          {name}
        </span>
      )}

      {/* Visibility toggle */}
      <RowIconButton
        title={visible ? "Hide layer" : "Show layer"}
        active={!visible}
        onClick={toggleVisible}
      >
        <Icon name={visible ? "eye" : "eyeOff"} size={13} />
      </RowIconButton>

      {/* Lock toggle */}
      <RowIconButton
        title={locked ? "Unlock layer" : "Lock layer"}
        active={locked}
        onClick={toggleLocked}
      >
        <Icon name={locked ? "lock" : "unlock"} size={13} />
      </RowIconButton>
    </div>
  );
}

function RowIconButton({ children, title, active, onClick }: { children: React.ReactNode; title: string; active: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
        title={title}
        aria-label={title}
        onClick={onClick}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, border: "none", borderRadius: 4, cursor: "pointer",
        background: "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        opacity: active ? 1 : 0.55,
        padding: 0, flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
