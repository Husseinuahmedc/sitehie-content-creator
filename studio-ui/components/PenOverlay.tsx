"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Circle, Group, Line, Path, Rect } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CanvasPathPoint } from "@sitehie/core/domain";
import type { PenDraft } from "@/lib/pen";

const ACCENT = "#3D52D5";

type Props = {
  mode: "create" | "edit";
  draft: PenDraft;
  /** Frame-space cursor position for the rubber-band preview (create mode). */
  cursor: { x: number; y: number } | null;
  scale: number;
  stroke: string;
  strokeWidth: number;
  /** Live (uncommitted) draft update during a drag. */
  onDraft: (d: PenDraft) => void;
  /** Commit after a completed anchor/handle drag. */
  onCommit: (d: PenDraft) => void;
  /** Alt+click an anchor deletes it (edit mode). */
  onDeleteAnchor: (index: number) => void;
  /** Close the path by clicking the first anchor (create mode). */
  onClosePath: () => void;
  /** After a segment insertion, the anchor at this index grabs the in-progress
   *  mouse drag via Konva's startDrag transfer. Token increments per insertion
   *  so the effect re-fires even when the index repeats. */
  dragTransfer: { index: number; token: number } | null;
};

/** Serializes to SVG path data — identical math to buildCanvasPathD in
 *  carousel-tool/templates/shared/slide-runtime.js. */
function buildD(points: CanvasPathPoint[], closed: boolean): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    d += ` C ${prev.x + (prev.handleOut?.x ?? 0)} ${prev.y + (prev.handleOut?.y ?? 0)}, ${cur.x + (cur.handleIn?.x ?? 0)} ${cur.y + (cur.handleIn?.y ?? 0)}, ${cur.x} ${cur.y}`;
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1];
    const first = points[0];
    d += ` C ${last.x + (last.handleOut?.x ?? 0)} ${last.y + (last.handleOut?.y ?? 0)}, ${first.x + (first.handleIn?.x ?? 0)} ${first.y + (first.handleIn?.y ?? 0)}, ${first.x} ${first.y} Z`;
  }
  return d;
}

/**
 * PenOverlay renders the pen session inside the SCALED canvas layer:
 * the live path preview, rubber-band segment, draggable anchors, and
 * draggable bezier handles. All geometry is frame-space; UI sizes are
 * divided by `scale` so they appear screen-sized.
 *
 * Anchors and handles are Konva-draggable, so drag events (not stage pointer
 * math) drive updates. onDraft fires per dragmove; onCommit fires on dragend
 * (one undo step per gesture).
 */
export default function PenOverlay({ mode, draft, cursor, scale, stroke, strokeWidth, onDraft, onCommit, onDeleteAnchor, onClosePath, dragTransfer }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const anchorR = 5 / scale;
  const handleR = 3.5 / scale;
  const hairline = 1 / scale;
  const closeR = 10 / scale;

  const pts = draft.points;
  const d = buildD(pts, draft.closed);

  // After a segment insertion, hand the in-progress mouse drag to the new anchor.
  useEffect(() => {
    if (!dragTransfer || !groupRef.current) return;
    const node = groupRef.current.findOne(`.pen-anchor-${dragTransfer.index}`);
    if (node) {
      try {
        node.startDrag();
      } catch {
        /* best-effort: user can grab the anchor manually */
      }
    }
  }, [dragTransfer]);

  // Rubber-band: last anchor → cursor (create mode only, path not closed).
  let rubber: string | null = null;
  if (mode === "create" && !draft.closed && pts.length > 0 && cursor) {
    const last = pts[pts.length - 1];
    rubber = buildD([last, { x: cursor.x, y: cursor.y, handleIn: null, handleOut: null, corner: true }], false);
  }

  const setPoint = (index: number, patch: Partial<CanvasPathPoint>, commit: boolean) => {
    const nd = { ...draft, points: pts.map((p, i) => (i === index ? { ...p, ...patch } : p)) };
    if (commit) onCommit(nd);
    else onDraft(nd);
  };

  const handlePatch = (p: CanvasPathPoint, which: "in" | "out", rel: { x: number; y: number }, mirror: boolean): Partial<CanvasPathPoint> =>
    which === "out"
      ? { handleOut: rel, ...(mirror && p.handleIn ? { handleIn: { x: -rel.x, y: -rel.y } } : {}) }
      : { handleIn: rel, ...(mirror && p.handleOut ? { handleOut: { x: -rel.x, y: -rel.y } } : {}) };

  return (
    <Group ref={groupRef}>
      {/* Live path preview */}
      {d !== "" && (
        <Path
          data={d}
          fillEnabled={draft.closed}
          fill={mode === "edit" ? "rgba(61,82,213,0.10)" : undefined}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )}

      {/* Rubber-band preview to cursor */}
      {rubber && <Path data={rubber} stroke={ACCENT} strokeWidth={hairline} dash={[4 / scale, 3 / scale]} listening={false} />}

      {/* First-anchor close target (create mode). Listens so a click here is
       *  caught by THIS node (stage handler skips non-frame targets) and
       *  closes the path without adding a duplicate anchor. */}
      {mode === "create" && !draft.closed && pts.length >= 2 && (
        <Circle
          x={pts[0].x}
          y={pts[0].y}
          radius={closeR}
          stroke={ACCENT}
          strokeWidth={hairline}
          dash={[3 / scale, 3 / scale]}
          onMouseDown={(e) => {
            e.cancelBubble = true;
            onClosePath();
          }}
        />
      )}

      {/* Handle arms + draggable dots (edit mode) */}
      {mode === "edit" &&
        pts.flatMap((p, i) => {
          const els: ReactNode[] = [];
          const mk = (which: "in" | "out", rel: { x: number; y: number }) => (
            <Circle
              key={`h${which}${i}`}
              x={p.x + rel.x}
              y={p.y + rel.y}
              radius={handleR}
              fill={which === "out" ? ACCENT : "#ffffff"}
              stroke={which === "out" ? "#ffffff" : ACCENT}
              strokeWidth={hairline}
              draggable
              onDragStart={(e) => {
                e.cancelBubble = true;
              }}
              onDragMove={(e: KonvaEventObject<DragEvent>) => setPoint(i, handlePatch(p, which, { x: e.target.x() - p.x, y: e.target.y() - p.y }, !e.evt.altKey), false)}
              onDragEnd={(e) => setPoint(i, handlePatch(p, which, { x: e.target.x() - p.x, y: e.target.y() - p.y }, !e.evt.altKey), true)}
            />
          );
          if (p.handleIn) {
            els.push(<Line key={`ai${i}`} points={[p.x, p.y, p.x + p.handleIn.x, p.y + p.handleIn.y]} stroke="rgba(255,255,255,0.35)" strokeWidth={hairline} listening={false} />, mk("in", p.handleIn));
          }
          if (p.handleOut) {
            els.push(<Line key={`ao${i}`} points={[p.x, p.y, p.x + p.handleOut.x, p.y + p.handleOut.y]} stroke="rgba(255,255,255,0.35)" strokeWidth={hairline} listening={false} />, mk("out", p.handleOut));
          }
          return els;
        })}

      {/* Anchors */}
      {pts.map((p, i) =>
        mode === "edit" ? (
          <Rect
            key={`a${i}`}
            name={`pen-anchor-${i}`}
            x={p.x - anchorR}
            y={p.y - anchorR}
            width={anchorR * 2}
            height={anchorR * 2}
            fill="#ffffff"
            stroke={ACCENT}
            strokeWidth={hairline}
            draggable
            onMouseDown={(e) => {
              if (e.evt.altKey) {
                e.cancelBubble = true;
                onDeleteAnchor(i);
              }
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => setPoint(i, { x: e.target.x() + anchorR, y: e.target.y() + anchorR }, false)}
            onDragEnd={(e) => setPoint(i, { x: e.target.x() + anchorR, y: e.target.y() + anchorR }, true)}
          />
        ) : (
          <Circle
            key={`a${i}`}
            x={p.x}
            y={p.y}
            radius={anchorR}
            fill={i === 0 ? "#ffffff" : ACCENT}
            stroke={ACCENT}
            strokeWidth={hairline}
            onMouseDown={
              i === 0 && pts.length >= 2 && !draft.closed
                ? (e) => {
                    e.cancelBubble = true;
                    onClosePath();
                  }
                : undefined
            }
          />
        )
      )}
    </Group>
  );
}
