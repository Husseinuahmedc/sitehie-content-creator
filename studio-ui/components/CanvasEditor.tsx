"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Ellipse, Line, Path, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CanvasGroup, CanvasObject, CanvasPathPoint, CanvasSlide, Slide } from "@sitehie/core/domain";
import LayersPanel from "./LayersPanel";
import PenOverlay from "./PenOverlay";
import { applyGroup, applyUngroup, isEffectivelyLocked, isEffectivelyVisible, pruneEmptyGroups, reorderLayers } from "@/lib/layers";
import { insertPointNear, removePoint, type PenDraft } from "@/lib/pen";

/* ── Types ─────────────────────────────────────────────────────────────── */

type Tool = "select" | "pen";

/** A pen gesture in flight: the index of the point placed on mousedown, the
 *  screen-space mousedown position, and whether the pointer has moved enough
 *  to pull handles out of the point. */
type PenGesture = { index: number; downX: number; downY: number; dragging: boolean } | null;

/** Canvas objects with frame geometry (everything except freeform paths). */
type ShapeObject = CanvasObject & { type: "rect" | "circle" | "polygon" | "text" };

/* ── Constants ─────────────────────────────────────────────────────────── */

/** Matches --accent in globals.css (Konva needs concrete colors). */
const ACCENT = "#3D52D5";

function uid() {
  return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const isShape = (o: CanvasObject): o is ShapeObject => o.type !== "path";

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Serializes points to SVG path data. Must stay in sync with
 *  buildCanvasPathD in carousel-tool/templates/shared/slide-runtime.js. */
function buildSvgPath(points: CanvasPathPoint[], closed: boolean): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const c1x = prev.x + (prev.handleOut?.x ?? 0);
    const c1y = prev.y + (prev.handleOut?.y ?? 0);
    const c2x = cur.x + (cur.handleIn?.x ?? 0);
    const c2y = cur.y + (cur.handleIn?.y ?? 0);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${cur.x} ${cur.y}`;
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1];
    const first = points[0];
    const c1x = last.x + (last.handleOut?.x ?? 0);
    const c1y = last.y + (last.handleOut?.y ?? 0);
    const c2x = first.x + (first.handleIn?.x ?? 0);
    const c2y = first.y + (first.handleIn?.y ?? 0);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${first.x} ${first.y} Z`;
  }
  return d;
}

/** Polygon vertices relative to the bounding-box center (flat Konva points).
 *  Matches the export engine: vertices start at 12 o'clock, rotation = 0. */
function polygonPointsCentered(w: number, h: number, sides: number): number[] {
  const rx = w / 2;
  const ry = h / 2;
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    pts.push(rx * Math.cos(a), ry * Math.sin(a));
  }
  return pts;
}

/* ── Main Component ──────────────────────────────────────────────────── */

type Props = {
  slide: CanvasSlide;
  onChange: (s: Slide) => void;
};

export default function CanvasEditor({ slide, onChange }: Props) {
  const frame = slide.frame;
  const groups = useMemo(() => slide.groups ?? [], [slide.groups]);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /* ── Pen session (Stage 4) ─────────────────────────────────────────── */
  // Non-null draft ⇔ a pen session is active. penTargetId null = create mode,
  // otherwise the id of the path object being edited.
  const [penDraft, setPenDraft] = useState<PenDraft | null>(null);
  const [penTargetId, setPenTargetId] = useState<string | null>(null);
  const [, setPenTick] = useState(0); // forces overlay re-render for cursor/rubber-band
  const penGesture = useRef<PenGesture>(null);
  const penCursor = useRef<{ x: number; y: number } | null>(null);
  const penDragTransfer = useRef<{ index: number; token: number } | null>(null);
  const penTokenCounter = useRef(0);
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({});
  const trRef = useRef<Konva.Transformer>(null);
  // Coalesces per-node commit events (Konva fires dragend/transformend on
  // EVERY attached node during one multi-node gesture) into a single
  // onChange — one undo step per logical action.
  const commitRef = useRef<{ timer: number | null; patches: Map<string, Partial<CanvasObject>> }>({
    timer: null,
    patches: new Map(),
  });
  const panelW = 360;
  const panelH = 450;
  const scale = Math.min(panelW / frame.width, panelH / frame.height) * 0.92;
  const viewW = frame.width * scale;
  const viewH = frame.height * scale;
  const offX = (panelW - viewW) / 2;
  const offY = (panelH - viewH) / 2;

  const patchSlide = useCallback(
    (patch: Partial<CanvasSlide>) => {
      onChange({ ...slide, ...patch } as Slide);
    },
    [slide, onChange]
  );

  const patchObject = useCallback(
    (id: string, patch: Partial<CanvasObject>) => {
      const next = slide.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as CanvasObject) : o));
      patchSlide({ objects: next });
    },
    [slide, patchSlide]
  );

  const patchGroup = useCallback(
    (id: string, patch: Partial<CanvasGroup>) => {
      patchSlide({ groups: groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
    },
    [groups, patchSlide]
  );

  const onReorderLayers = useCallback(
    (activeId: string, overId: string) => {
      const next = reorderLayers(slide.objects, groups, activeId, overId);
      if (next !== slide.objects) patchSlide({ objects: next });
    },
    [slide, groups, patchSlide]
  );

  /* ── Selection (multi-select with Shift) ────────────────────────────── */

  const selectObject = useCallback((id: string | null, additive = false) => {
    if (id === null) {
      setSelectedIds([]);
      return;
    }
    if (additive) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelectedIds([id]);
    }
  }, []);

  /* ── Add-shape actions (single undo step each) ─────────────────────── */

  const addRect = useCallback(() => {
    const obj: CanvasObject = {
      id: uid(), type: "rect", x: frame.width / 2 - 80, y: frame.height / 2 - 60,
      w: 160, h: 120, rotation: 0, fill: ACCENT, stroke: "", strokeWidth: 0, borderRadius: 8,
    };
    patchSlide({ objects: [...slide.objects, obj] });
    setSelectedIds([obj.id]); setTool("select");
  }, [frame, slide, patchSlide]);

  const addCircle = useCallback(() => {
    const obj: CanvasObject = {
      id: uid(), type: "circle", x: frame.width / 2 - 60, y: frame.height / 2 - 60,
      w: 120, h: 120, rotation: 0, fill: ACCENT, stroke: "", strokeWidth: 0,
    };
    patchSlide({ objects: [...slide.objects, obj] });
    setSelectedIds([obj.id]); setTool("select");
  }, [frame, slide, patchSlide]);

  const addPolygon = useCallback(() => {
    const obj: CanvasObject = {
      id: uid(), type: "polygon", x: frame.width / 2 - 60, y: frame.height / 2 - 60,
      w: 120, h: 120, rotation: 0, fill: ACCENT, stroke: "", strokeWidth: 0, sides: 3,
    };
    patchSlide({ objects: [...slide.objects, obj] });
    setSelectedIds([obj.id]); setTool("select");
  }, [frame, slide, patchSlide]);

  const addText = useCallback(() => {
    const label = "Text";
    const fontSize = 48;
    const lineHeight = 1.2;
    const w = Math.max(120, Math.ceil(label.length * fontSize * 0.62));
    const h = Math.ceil(fontSize * lineHeight);
    const obj: CanvasObject = {
      id: uid(), type: "text", x: frame.width / 2 - w / 2, y: frame.height / 2 - h / 2,
      w, h, rotation: 0, text: label, fontSize, fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: "bold", align: "center", fill: "#FFFFFF", lineHeight,
    };
    patchSlide({ objects: [...slide.objects, obj] });
    setSelectedIds([obj.id]); setTool("select");
  }, [frame, slide, patchSlide]);

  /* ── Selection ─────────────────────────────────────────────────────── */

  // Bind the Transformer to the selected shape nodes (multi-node supported).
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => slide.objects.find((o) => o.id === id))
      .filter((o) => o && isShape(o) && tool === "select" && isEffectivelyVisible(o, groups) && !isEffectivelyLocked(o, groups))
      .map((o) => nodeRefs.current[o!.id])
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    // Disable the shared bbox `back` shape's pointer events so a member node
    // (not the bbox) is grabbed during multi-drag. Konva's proxy turns the
    // screen-space drag delta into node-local units, which is wrong inside a
    // scaled layer; grabbing a node directly keeps positions scale-correct.
    const back = tr.findOne(".back");
    if (back) back.listening(false);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, slide.objects, groups, tool]);

  /* ── Drag / transform commit (one onChange per logical action) ─────── */

  const flushCommits = useCallback(() => {
    const c = commitRef.current;
    c.timer = null;
    if (c.patches.size === 0) return;
    const byId = new Map(c.patches);
    c.patches.clear();
    const next = slide.objects.map((o) => (byId.has(o.id) ? ({ ...o, ...byId.get(o.id) } as CanvasObject) : o));
    patchSlide({ objects: next });
  }, [slide, patchSlide]);

  const stageCommit = useCallback(
    (id: string, patch: Partial<CanvasObject>) => {
      const c = commitRef.current;
      c.patches.set(id, patch);
      if (c.timer === null) c.timer = window.setTimeout(flushCommits, 0);
    },
    [flushCommits]
  );

  // Manual drag handled at the stage level. Konva's Transformer proxies drags
  // of every attached node through its shared bbox, and inside a scaled layer
  // it converts the screen-space pointer delta into node-local units (wrong
  // by a factor of `scale` for multi-attachment). Driving the move ourselves
  // from stage pointer coords keeps positions scale-correct for both single
  // and multi selection. Resize/rotate still go through Transformer anchors.
  const manualDrag = useRef<{
    set: Record<string, { startX: number; startY: number }>;
    origin: { x: number; y: number };
  } | null>(null);

  const beginManualDrag = useCallback(
    (obj: CanvasObject, mx: number, my: number, additive: boolean) => {
      const set: Record<string, { startX: number; startY: number }> = {};
      const grabIn = (id: string) => {
        const o = slide.objects.find((x) => x.id === id);
        const n = nodeRefs.current[id];
        if (o && n && o.type !== "path" && isEffectivelyVisible(o, groups) && !isEffectivelyLocked(o, groups)) {
          set[id] = { startX: n.x(), startY: n.y() };
        }
      };
      const isMember = selectedIds.includes(obj.id);
      if (isMember && selectedIds.length > 1) for (const id of selectedIds) grabIn(id);
      else grabIn(obj.id);
      // Selection: keep an existing multi-selection when grabbing a member,
      // otherwise select the grabbed object (additive with Shift).
      if (!isMember) selectObject(obj.id, additive);
      manualDrag.current = { set, origin: { x: mx, y: my } };
    },
    [selectedIds, slide.objects, groups, selectObject]
  );

  const continueManualDrag = useCallback(
    (mx: number, my: number) => {
      const md = manualDrag.current;
      if (!md) return;
      // Total delta from the drag origin, converted from screen to frame units.
      const dx = (mx - md.origin.x) / scale;
      const dy = (my - md.origin.y) / scale;
      for (const [id, s] of Object.entries(md.set)) {
        const n = nodeRefs.current[id];
        if (n) {
          n.x(s.startX + dx);
          n.y(s.startY + dy);
        }
      }
    },
    [scale]
  );

  const endManualDrag = useCallback(() => {
    const md = manualDrag.current;
    manualDrag.current = null;
    if (!md) return;
    for (const id of Object.keys(md.set)) {
      const o = slide.objects.find((x) => x.id === id);
      const n = nodeRefs.current[id];
      if (!o || !n || o.type === "path") continue;
      stageCommit(id, { x: n.x() - o.w / 2, y: n.y() - o.h / 2 });
    }
  }, [slide, stageCommit]);

  /* ── Pen tool (Stage 4) ────────────────────────────────────────────── */

  const penTarget = penTargetId
    ? slide.objects.find((o): o is Extract<CanvasObject, { type: "path" }> => o.id === penTargetId && o.type === "path")
    : undefined;

  const toFramePoint = useCallback(
    (screenX: number, screenY: number) => ({ x: (screenX - offX) / scale, y: (screenY - offY) / scale }),
    [offX, offY, scale]
  );

  const startPenCreate = useCallback(() => {
    setSelectedIds([]);
    setPenTargetId(null);
    setPenDraft({ points: [], closed: false });
    penGesture.current = null;
    setTool("pen");
  }, []);

  const startPenEdit = useCallback(
    (id: string) => {
      const obj = slide.objects.find((o) => o.id === id);
      if (!obj || obj.type !== "path") return;
      if (!isEffectivelyVisible(obj, groups) || isEffectivelyLocked(obj, groups)) return;
      setSelectedIds([id]);
      setPenTargetId(id);
      setPenDraft({
        points: obj.points.map((p) => ({
          ...p,
          handleIn: p.handleIn ? { ...p.handleIn } : null,
          handleOut: p.handleOut ? { ...p.handleOut } : null,
        })),
        closed: obj.closed,
      });
      penGesture.current = null;
      setTool("pen");
    },
    [slide.objects, groups]
  );

  /** Write the draft into the store: as a new path object (create mode) or a
   *  points/closed patch on the edit target. One onChange → one undo step. */
  const commitPenDraft = useCallback(
    (draft: PenDraft) => {
      if (penTargetId) {
        patchObject(penTargetId, { points: draft.points, closed: draft.closed } as Partial<CanvasObject>);
      } else if (draft.points.length >= 2) {
        const obj: CanvasObject = {
          id: uid(),
          type: "path",
          points: draft.points,
          closed: draft.closed,
          fill: "none",
          stroke: "#FFFFFF",
          strokeWidth: 6,
        };
        patchSlide({ objects: [...slide.objects, obj] });
        setSelectedIds([obj.id]);
      }
    },
    [penTargetId, patchObject, patchSlide, slide.objects]
  );

  const exitPen = useCallback(
    (finalDraft: PenDraft | null) => {
      if (finalDraft) commitPenDraft(finalDraft);
      setPenDraft(null);
      setPenTargetId(null);
      penGesture.current = null;
      penDragTransfer.current = null;
      setTool("select");
    },
    [commitPenDraft]
  );

  /** Strip a trailing duplicate anchor produced by the second click of a
   *  double-click finish (dblclick fires mousedown twice at ~the same spot). */
  const dedupeTail = useCallback(
    (draft: PenDraft): PenDraft => {
      const pts = draft.points;
      if (pts.length < 2) return draft;
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 3 / scale && !b.handleIn && !b.handleOut) {
        return { ...draft, points: pts.slice(0, -1) };
      }
      return draft;
    },
    [scale]
  );

  /** Live overlay callbacks (anchors/handles drive these via Konva drags). */
  const penOverlayDraft = useCallback((d: PenDraft) => setPenDraft(d), []);
  const penOverlayCommit = useCallback(
    (d: PenDraft) => {
      setPenDraft(d);
      commitPenDraft(d);
    },
    [commitPenDraft]
  );
  const penDeleteAnchor = useCallback(
    (index: number) => {
      setPenDraft((prev) => (prev && prev.points.length > 2 ? { ...prev, points: removePoint(prev.points, index) } : prev));
    },
    []
  );
  const penClosePath = useCallback(() => {
    setPenDraft((prev) => {
      if (prev && prev.points.length >= 2) exitPen({ ...prev, closed: true }); // @close
      return prev;
    });
  }, [exitPen]);

  /** Pen-mode stage handlers — called from the main stage handlers. */
  const penMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = e.target.getStage();
      if (!stage || !penDraft) return;
      // Overlay anchors/handles manage their own drags; only empty-canvas
      // clicks reach the path-creation / segment-insertion logic.
      if (e.target !== stage && e.target.name() !== "frame-bg") return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const p = toFramePoint(pos.x, pos.y);
      penCursor.current = p;

      if (!penTargetId) {
        // Create mode: place an anchor; handles are pulled in penMouseMove.
        if (penDraft.closed) return;
        const next: PenDraft = {
          ...penDraft,
          points: [...penDraft.points, { x: p.x, y: p.y, handleIn: null, handleOut: null, corner: true }],
        };
        setPenDraft(next);
        penGesture.current = { index: next.points.length - 1, downX: pos.x, downY: pos.y, dragging: false };
        return;
      }
      // Edit mode: Alt+click deletions are handled by the anchor itself.
      if ((e.evt as MouseEvent).altKey) return;
      const ins = insertPointNear(penDraft.points, penDraft.closed, p, 8 / scale);
      if (ins) {
        setPenDraft({ ...penDraft, points: ins.points });
        penDragTransfer.current = { index: ins.index, token: ++penTokenCounter.current };
      }
    },
    [penDraft, penTargetId, toFramePoint, scale]
  );

  const penMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = e.target.getStage();
      if (!stage || !penDraft) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const p = toFramePoint(pos.x, pos.y);
      penCursor.current = p;
      const g = penGesture.current;
      if (g && !penTargetId) {
        if (!g.dragging && Math.hypot(pos.x - g.downX, pos.y - g.downY) > 3) g.dragging = true;
        if (g.dragging) {
          const pts = penDraft.points.slice();
          const cur = { ...pts[g.index] };
          cur.handleOut = { x: p.x - cur.x, y: p.y - cur.y };
          cur.handleIn = { x: -(p.x - cur.x), y: -(p.y - cur.y) };
          cur.corner = false;
          pts[g.index] = cur;
          setPenDraft({ ...penDraft, points: pts });
          return;
        }
      }
      setPenTick((t) => t + 1); // refresh rubber-band preview
    },
    [penDraft, penTargetId, toFramePoint]
  );

  const penMouseUp = useCallback(() => {
    penGesture.current = null;
  }, []);

  const penDblClick = useCallback(() => {
    if (!penDraft || penTargetId) return; // create mode only
    if (penDraft.points.length >= 2) exitPen(dedupeTail(penDraft)); // @dbl
    else exitPen(null);
  }, [penDraft, penTargetId, exitPen, dedupeTail]);

  // If the edit target is deleted externally (e.g. via Layers panel), end the session.
  useEffect(() => {
    if (tool === "pen" && penTargetId && !slide.objects.some((o) => o.id === penTargetId)) {
      setPenDraft(null);
      setPenTargetId(null);
      setTool("select");
    }
  }, [tool, penTargetId, slide.objects]);

  /* ── Stage pointer handlers (drive manual drag / pen) ──────────────── */

  const onStagePointerDown = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (tool === "pen") {
        penMouseDown(e);
        return;
      }
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      // Eat hits on the Transformer's anchors/handles — their own drags handle it.
      const tr = trRef.current;
      const tgt = e.target as Konva.Node | Konva.Stage;
      if (tr && (tgt === tr || tgt.getParent() === tr)) return;
      // Click on empty stage or the frame background deselects and starts nothing.
      if (e.target === stage || e.target.name() === "frame-bg") {
        setSelectedIds([]);
        return;
      }
      // Dragging a shape begins manual drag of the selection.
      if (pos) {
        const tid = (e.target as Konva.Shape).id?.();
        const obj = slide.objects.find((o) => o.id === tid);
        if (obj) beginManualDrag(obj, pos.x, pos.y, e.evt.shiftKey);
      }
    },
    [tool, penMouseDown, slide.objects, beginManualDrag]
  );

  const onStagePointerMove = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (tool === "pen") {
        penMouseMove(e);
        return;
      }
      if (!manualDrag.current) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (pos) continueManualDrag(pos.x, pos.y);
    },
    [tool, penMouseMove, continueManualDrag]
  );

  const onStagePointerUp = useCallback(() => {
    if (tool === "pen") {
      penMouseUp();
      return;
    }
    endManualDrag();
  }, [tool, penMouseUp, endManualDrag]);

  const onStageDblClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (tool === "pen") penDblClick();
    },
    [tool, penDblClick]
  );

  const onShapeTransformEnd = useCallback(
    (obj: ShapeObject, e: KonvaEventObject<Event>) => {
      const node = e.target;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      const w = Math.max(8, obj.w * sx);
      const h = Math.max(8, obj.h * sy);
      const patch: Partial<CanvasObject> = {
        x: node.x() - w / 2,
        y: node.y() - h / 2,
        w,
        h,
        rotation: node.rotation(),
      };
      // Text boxes scale their font instead of the box: bakes vertical scale
      // into fontSize so the export (which renders fontSize directly) matches.
      if (obj.type === "text") {
        (patch as { fontSize?: number }).fontSize = Math.max(8, Math.round(obj.fontSize * sy));
      }
      stageCommit(obj.id, patch);
    },
    [stageCommit]
  );

  /* ── Group / ungroup ───────────────────────────────────────────────── */

  const groupSelection = useCallback(() => {
    const memberIds = selectedIds.filter((id) => slide.objects.some((o) => o.id === id));
    if (memberIds.length < 2) return;
    const gid = `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const objects = applyGroup(slide.objects, memberIds, gid);
    const groupsNext = pruneEmptyGroups(objects, [...groups, { id: gid, type: "group" }]);
    patchSlide({ objects, groups: groupsNext });
  }, [selectedIds, slide.objects, groups, patchSlide]);

  const ungroupSelection = useCallback(() => {
    const memberIds = selectedIds.filter((id) => slide.objects.some((o) => o.id === id));
    if (memberIds.length === 0) return;
    const res = applyUngroup(slide.objects, slide.groups, memberIds);
    patchSlide({ objects: res.objects, ...(res.groups !== slide.groups ? { groups: res.groups } : {}) });
  }, [selectedIds, slide.objects, slide.groups, patchSlide]);

  /* ── Keyboard ──────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      // Pen-mode keys (create + edit share finish/cancel; create-only for Backspace).
      if (tool === "pen") {
        const finish = () => {
          if (penDraft) exitPen(dedupeTail(penDraft)); // @key
        };
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          finish();
          return;
        }
        if (!penTargetId && (e.key === "Backspace" || e.key === "Delete") && penGesture.current === null) {
          e.preventDefault();
          setPenDraft((prev) => (prev && prev.points.length > 0 ? { ...prev, points: prev.points.slice(0, -1) } : prev));
          return;
        }
        return;
      }
      // Select-mode keys.
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        startPenCreate();
        return;
      }
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length === 0) return;
        const removed = new Set(selectedIds);
        const objects = slide.objects.filter((o) => !removed.has(o.id));
        const groupsPruned = pruneEmptyGroups(objects, slide.groups);
        patchSlide({ objects, ...(groupsPruned !== slide.groups ? { groups: groupsPruned } : {}) });
        setSelectedIds([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selectedIds, slide, patchSlide, groupSelection, ungroupSelection, penDraft, penTargetId, exitPen, dedupeTail, penGesture, startPenCreate]);

  const selectedObj = slide.objects.find((o) => o.id === selectedIds[selectedIds.length - 1]) ?? null;

  /* ── Frame background fill (matches export gradient math) ──────────── */

  const bgProps = useMemo(() => {
    if (frame.backgroundType === "linear" && frame.backgroundTo) {
      const angle = ((frame.backgroundAngle ?? 135) * Math.PI) / 180;
      return {
        fillLinearGradientStartPoint: {
          x: (frame.width * (50 + 50 * Math.cos(angle + Math.PI))) / 100,
          y: (frame.height * (50 + 50 * Math.sin(angle + Math.PI))) / 100,
        },
        fillLinearGradientEndPoint: {
          x: (frame.width * (50 + 50 * Math.cos(angle))) / 100,
          y: (frame.height * (50 + 50 * Math.sin(angle))) / 100,
        },
        fillLinearGradientColorStops: [0, frame.background, 1, frame.backgroundTo],
      };
    }
    return { fill: frame.background };
  }, [frame]);

  /* ── Render ───────────────────────────────────────────────────────── */

  const gridV = Array.from({ length: Math.floor(frame.width / 40) + 1 }, (_, i) => i * 40);
  const gridH = Array.from({ length: Math.floor(frame.height / 40) + 1 }, (_, i) => i * 40);
  const minBox = 20 * scale; // boundBoxFunc works in screen pixels

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <ToolButton active={tool === "select"} onClick={() => setTool("select")} label="Select" icon="↖" />
        <ToolButton active={false} onClick={addRect} label="Rect" icon="▭" />
        <ToolButton active={false} onClick={addCircle} label="Circle" icon="◯" />
        <ToolButton active={false} onClick={addPolygon} label="Triangle" icon="△" />
        <ToolButton active={false} onClick={addText} label="Text" icon="T" />
        <ToolButton active={tool === "pen"} onClick={() => (tool === "pen" ? exitPen(penDraft) /* @toolbar */ : startPenCreate())} label="Pen (P) — click to place points, drag for curves, click first anchor to close" icon="✎" />
        {selectedIds.length > 1 && (
          <>
            <ToolButton active={false} onClick={groupSelection} label="Group (Ctrl+G)" icon="❐" />
            <ToolButton active={false} onClick={ungroupSelection} label="Ungroup (Ctrl+Shift+G)" icon="⧉" />
          </>
        )}
      </div>

      {/* Canvas */}
      <div style={{ width: panelW, height: panelH, position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0, alignSelf: "center" }}>
        <Stage
          width={panelW}
          height={panelH}
          onMouseDown={onStagePointerDown}
          onTouchStart={onStagePointerDown}
          onMouseMove={onStagePointerMove}
          onTouchMove={onStagePointerMove}
          onMouseUp={onStagePointerUp}
          onTouchEnd={onStagePointerUp}
          onDblClick={onStageDblClick}
        >
          <Layer x={offX} y={offY} scaleX={scale} scaleY={scale}>
            {/* Frame background */}
            <Rect
              name="frame-bg"
              x={0}
              y={0}
              width={frame.width}
              height={frame.height}
              cornerRadius={frame.borderRadius ?? 0}
              {...bgProps}
            />

            {/* Grid */}
            {gridV.map((x) => (
              <Line key={`v${x}`} points={[x, 0, x, frame.height]} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeScaleEnabled={false} listening={false} />
            ))}
            {gridH.map((y) => (
              <Line key={`h${y}`} points={[0, y, frame.width, y]} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeScaleEnabled={false} listening={false} />
            ))}

            {/* Objects (skip the path under active pen edit — the overlay shows it live) */}
            {slide.objects.map((obj) =>
              obj.id === penTargetId ? null : (
                <CanvasNode
                  key={obj.id}
                  obj={obj}
                  groups={groups}
                  selected={selectedIds.includes(obj.id)}
                  interactive={tool === "select"}
                  registerNode={(id, node) => { nodeRefs.current[id] = node; }}
                  onTransformEnd={onShapeTransformEnd}
                  onEnterPenEdit={startPenEdit}
                />
              )
            )}

            {/* Pen session overlay (create + edit) */}
            {penDraft && (
              <PenOverlay
                mode={penTargetId ? "edit" : "create"}
                draft={penDraft}
                cursor={penCursor.current}
                scale={scale}
                stroke={penTarget?.stroke || "#FFFFFF"}
                strokeWidth={penTarget?.strokeWidth ?? 6}
                onDraft={penOverlayDraft}
                onCommit={penOverlayCommit}
                onDeleteAnchor={penDeleteAnchor}
                onClosePath={penClosePath}
                dragTransfer={penDragTransfer.current}
              />
            )}
          </Layer>

          {/* Unscaled overlay: transformer handles stay screen-sized */}
          <Layer>
            <Transformer
              ref={trRef}
              rotateEnabled
              flipEnabled={false}
              keepRatio={false}
              ignoreStroke
              anchorSize={8}
              anchorCornerRadius={2}
              anchorStroke={ACCENT}
              anchorFill="#ffffff"
              borderStroke={ACCENT}
              borderDash={[4, 2]}
              rotateAnchorOffset={20}
              boundBoxFunc={(oldBox, newBox) => (newBox.width < minBox || newBox.height < minBox ? oldBox : newBox)}
            />
          </Layer>
        </Stage>
      </div>

      {/* Layers panel */}
      <LayersPanel
        objects={slide.objects}
        groups={groups}
        selectedIds={selectedIds}
        onSelect={selectObject}
        onReorder={onReorderLayers}
        onPatchObject={patchObject}
        onPatchGroup={patchGroup}
      />

      {/* Properties panel */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {selectedIds.length > 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="badge">{selectedIds.length} selected</span>
            <button className="btn btn-sm" onClick={groupSelection}>Group (Ctrl+G)</button>
            <button className="btn btn-sm" onClick={ungroupSelection}>Ungroup (Ctrl+Shift+G)</button>
          </div>
        ) : selectedObj ? (
          <ObjectProperties obj={selectedObj} onChange={(patch) => patchObject(selectedObj.id, patch)} />
        ) : (
          <FrameProperties frame={frame} onChange={(patch) => patchSlide({ frame: { ...frame, ...patch } })} />
        )}
      </div>
    </div>
  );
}

/* ── Canvas object node ──────────────────────────────────────────────── */

type CanvasNodeProps = {
  obj: CanvasObject;
  groups: CanvasGroup[];
  selected: boolean;
  interactive: boolean;
  registerNode: (id: string, node: Konva.Node | null) => void;
  onTransformEnd: (obj: ShapeObject, e: KonvaEventObject<Event>) => void;
  /** Double-click a path to enter pen edit mode. */
  onEnterPenEdit: (id: string) => void;
};

function CanvasNode({ obj, groups, selected, interactive, registerNode, onTransformEnd, onEnterPenEdit }: CanvasNodeProps) {
  // Hidden layers are not rendered at all; locked layers render but reject interaction.
  if (!isEffectivelyVisible(obj, groups)) return null;
  const locked = isEffectivelyLocked(obj, groups);
  const selectable = interactive && !locked;

  if (obj.type === "path") {
    return (
      <Path
        ref={(n) => registerNode(obj.id, n)}
        id={obj.id}
        data={buildSvgPath(obj.points, obj.closed)}
        fillEnabled={obj.closed && !!obj.fill && obj.fill !== "none"}
        fill={obj.fill}
        stroke={obj.stroke || ACCENT}
        strokeWidth={obj.strokeWidth || 3}
        lineCap="round"
        lineJoin="round"
        listening={selectable}
        onDblClick={() => selectable && onEnterPenEdit(obj.id)}
      />
    );
  }

  const shape = obj as ShapeObject;
  const common = {
    ref: (n: Konva.Node | null) => registerNode(obj.id, n),
    id: obj.id,
    // Nodes are positioned by their center so Konva rotation matches the
    // export engine's center-rotation transform group.
    x: shape.x + shape.w / 2,
    y: shape.y + shape.h / 2,
    rotation: shape.rotation,
    fill: shape.fill,
    stroke: shape.type === "text" ? undefined : shape.stroke || undefined,
    strokeWidth: shape.type === "text" ? 0 : shape.stroke ? shape.strokeWidth : 0,
    listening: selectable,
    onTransformEnd: (e: KonvaEventObject<Event>) => onTransformEnd(shape, e),
    onMouseEnter: (e: KonvaEventObject<MouseEvent>) => {
      if (selectable) e.target.getStage()!.container().style.cursor = "move";
    },
    onMouseLeave: (e: KonvaEventObject<MouseEvent>) => {
      e.target.getStage()!.container().style.cursor = "default";
    },
  };

  if (shape.type === "text") {
    return (
      <Text
        {...common}
        width={shape.w}
        height={shape.h}
        offsetX={shape.w / 2}
        offsetY={shape.h / 2}
        text={shape.text}
        fontSize={shape.fontSize}
        fontFamily={shape.fontFamily}
        fontStyle={shape.fontWeight === "bold" ? "bold" : shape.fontWeight === "normal" ? "normal" : shape.fontWeight}
        align={shape.align}
        lineHeight={shape.lineHeight}
        verticalAlign="top"
        wrap="word"
      />
    );
  }

  if (shape.type === "rect") {
    return (
      <Rect
        {...common}
        width={shape.w}
        height={shape.h}
        offsetX={shape.w / 2}
        offsetY={shape.h / 2}
        cornerRadius={shape.borderRadius}
      />
    );
  }
  if (shape.type === "circle") {
    // Ellipse origin is already its center — no offset needed.
    return <Ellipse {...common} radiusX={shape.w / 2} radiusY={shape.h / 2} />;
  }
  // polygon: closed Line with center-relative points, origin at center.
  return <Line {...common} points={polygonPointsCentered(shape.w, shape.h, shape.sides)} closed />;
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function ToolButton({ active, onClick, label, icon, disabled }: { active: boolean; onClick: () => void; label: string; icon: string; disabled?: boolean }) {
  return (
    <button
      className={`btn btn-sm ${active ? "btn-primary" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      style={{ minWidth: 34 }}
    >
      {icon}
    </button>
  );
}

function FrameProperties({ frame, onChange }: { frame: CanvasSlide["frame"]; onChange: (patch: Partial<CanvasSlide["frame"]>) => void }) {
  const presets: { label: string; w: number; h: number }[] = [
    { label: "1:1", w: 1080, h: 1080 },
    { label: "4:5", w: 1080, h: 1350 },
    { label: "9:16", w: 1080, h: 1920 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label>Background type</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn btn-sm ${frame.backgroundType === "solid" ? "active" : ""}`} onClick={() => onChange({ backgroundType: "solid" })}>Solid</button>
          <button className={`btn btn-sm ${frame.backgroundType === "linear" ? "active" : ""}`} onClick={() => onChange({ backgroundType: "linear" })}>Gradient</button>
        </div>
      </div>
      <div className="field-row">
        <ColorField label="Background" value={frame.background} onChange={(background) => onChange({ background })} />
        {frame.backgroundType === "linear" && (
          <ColorField label="Gradient to" value={frame.backgroundTo || "#ffffff"} onChange={(backgroundTo) => onChange({ backgroundTo })} />
        )}
      </div>
      {frame.backgroundType === "linear" && (
        <div className="field">
          <label>Gradient angle</label>
          <input type="range" min={0} max={360} value={frame.backgroundAngle ?? 135} onChange={(e) => onChange({ backgroundAngle: Number(e.target.value) })} />
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label>Width</label>
          <input type="number" className="control" value={frame.width} onChange={(e) => onChange({ width: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Height</label>
          <input type="number" className="control" value={frame.height} onChange={(e) => onChange({ height: Number(e.target.value) })} />
        </div>
      </div>
      <div className="field">
        <label>Aspect ratio presets</label>
        <div style={{ display: "flex", gap: 8 }}>
          {presets.map((p) => (
            <button key={p.label} className="btn btn-sm" onClick={() => onChange({ width: p.w, height: p.h })}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Corner radius</label>
        <input type="number" className="control" value={frame.borderRadius ?? 0} onChange={(e) => onChange({ borderRadius: Number(e.target.value) })} />
      </div>
    </div>
  );
}

function ObjectProperties({ obj, onChange }: { obj: CanvasObject; onChange: (patch: Partial<CanvasObject>) => void }) {
  const shape = obj.type !== "path";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="badge">{obj.type}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{obj.id.slice(0, 12)}</span>
      </div>
      {shape && (
        <div className="field-row">
          <div className="field">
            <label>X</label>
            <input type="number" className="control" value={Math.round(obj.x)} onChange={(e) => onChange({ x: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Y</label>
            <input type="number" className="control" value={Math.round(obj.y)} onChange={(e) => onChange({ y: Number(e.target.value) })} />
          </div>
        </div>
      )}
      {shape && (
        <div className="field-row">
          <div className="field">
            <label>Width</label>
            <input type="number" className="control" value={Math.round(obj.w)} onChange={(e) => onChange({ w: Math.max(8, Number(e.target.value)) })} />
          </div>
          <div className="field">
            <label>Height</label>
            <input type="number" className="control" value={Math.round(obj.h)} onChange={(e) => onChange({ h: Math.max(8, Number(e.target.value)) })} />
          </div>
        </div>
      )}
      {shape && (
        <div className="field">
          <label>Rotation</label>
          <input type="range" min={-180} max={180} value={obj.rotation} onChange={(e) => onChange({ rotation: Number(e.target.value) })} />
        </div>
      )}
      {obj.type === "rect" && (
        <div className="field">
          <label>Corner radius</label>
          <input type="number" className="control" value={obj.borderRadius} onChange={(e) => onChange({ borderRadius: Number(e.target.value) })} />
        </div>
      )}
      {obj.type === "polygon" && (
        <div className="field">
          <label>Sides</label>
          <input type="number" className="control" min={3} max={12} value={obj.sides} onChange={(e) => onChange({ sides: Math.max(3, Math.min(12, Number(e.target.value))) })} />
        </div>
      )}
      {obj.type === "text" && (
        <>
          <div className="field">
            <label>Text</label>
            <textarea
              className="control"
              rows={3}
              value={obj.text}
              onChange={(e) => onChange({ text: e.target.value })}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Font size</label>
              <input type="number" className="control" min={8} value={obj.fontSize} onChange={(e) => onChange({ fontSize: Math.max(8, Number(e.target.value)) })} />
            </div>
            <div className="field">
              <label>Line height</label>
              <input type="number" className="control" min={0.8} step={0.1} value={obj.lineHeight} onChange={(e) => onChange({ lineHeight: Math.max(0.8, Number(e.target.value)) })} />
            </div>
          </div>
          <div className="field">
            <label>Font family</label>
            <input type="text" className="control" value={obj.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} placeholder="Inter, system-ui, sans-serif" />
          </div>
          <div className="field">
            <label>Weight</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["normal", "bold"] as const).map((w) => (
                <button key={w} className={`btn btn-sm ${obj.fontWeight === w ? "active" : ""}`} onClick={() => onChange({ fontWeight: w })}>{w}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Align</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["left", "center", "right"] as const).map((a) => (
                <button key={a} className={`btn btn-sm ${obj.align === a ? "active" : ""}`} onClick={() => onChange({ align: a })}>{a}</button>
              ))}
            </div>
          </div>
        </>
      )}
      <ColorField label="Fill" value={obj.fill} onChange={(fill) => onChange({ fill })} />
      {obj.type !== "text" && (
        <>
          <ColorField label="Stroke" value={obj.stroke || ""} onChange={(stroke) => onChange({ stroke: stroke || undefined })} />
          <div className="field">
            <label>Stroke width</label>
            <input type="number" className="control" value={obj.strokeWidth} onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })} />
          </div>
        </>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 36, padding: 0, border: "none", cursor: "pointer" }} />
        <input type="text" className="control" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="none" style={{ flex: 1 }} />
      </div>
    </div>
  );
}
