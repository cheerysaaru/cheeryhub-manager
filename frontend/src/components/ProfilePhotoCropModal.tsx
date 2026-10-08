import { useRef, useState } from "react";
import { Button } from "./Button";
import { cropAndSaveProfilePic } from "../utils/profile";

const STAGE = 300;

function clampZoom(z: number): number {
  return Math.max(1, Math.min(3, z));
}

interface Props {
  imageSrc: string;
  onCancel: () => void;
  onSave: (base64: string) => void;
}

export function ProfilePhotoCropModal({ imageSrc, onCancel, onSave }: Props) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offX: number;
    offY: number;
  } | null>(null);

  const cropSize = dims ? Math.min(dims.w, dims.h) / zoom : 1;
  const scale = dims ? STAGE / cropSize : 1;
  const maxX = dims ? (dims.w - cropSize) / 2 : 0;
  const maxY = dims ? (dims.h - cropSize) / 2 : 0;
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  const safeOffset = { x: clamp(offset.x, maxX), y: clamp(offset.y, maxY) };

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function changeZoom(next: number) {
    const z = clampZoom(next);
    setZoom(z);
    const cs = dims ? Math.min(dims.w, dims.h) / z : 1;
    setOffset((prev) => ({
      x: clamp(prev.x, dims ? (dims.w - cs) / 2 : 0),
      y: clamp(prev.y, dims ? (dims.h - cs) / 2 : 0),
    }));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!dims) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offX: safeOffset.x,
      offY: safeOffset.y,
    };
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || !dims) return;
    setOffset({
      x: clamp(d.offX + (e.clientX - d.startX) / scale, maxX),
      y: clamp(d.offY + (e.clientY - d.startY) / scale, maxY),
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* Pointer may already be released. */
    }
  }

  async function handleSave() {
    if (!dims || saving) return;
    setSaving(true);
    try {
      const base64 = await cropAndSaveProfilePic(
        imageSrc,
        safeOffset.x,
        safeOffset.y,
        zoom,
      );
      onSave(base64);
    } finally {
      setSaving(false);
    }
  }

  const imgStyle: React.CSSProperties = dims
    ? {
        width: dims.w * scale,
        height: dims.h * scale,
        left: STAGE / 2 - (dims.w / 2 + safeOffset.x) * scale,
        top: STAGE / 2 - (dims.h / 2 + safeOffset.y) * scale,
      }
    : { opacity: 0 };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Adjust your profile photo"
    >
      <div className="modal-content modal-sm crop-modal">
        <h2 className="modal-title">Adjust your profile photo</h2>

        <div
          className={`crop-stage${dragging ? " dragging" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            src={imageSrc}
            alt=""
            className="crop-image"
            style={imgStyle}
            onLoad={handleLoad}
            draggable={false}
          />
          <div className="crop-mask" />
        </div>

        <div className="crop-zoom-row">
          <span className="crop-zoom-label">Zoom:</span>
          <button
            type="button"
            className="crop-zoom-btn"
            aria-label="Zoom out"
            onClick={() => changeZoom(zoom - 0.25)}
          >
            −
          </button>
          <input
            type="range"
            className="crop-zoom-slider"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            aria-label="Zoom"
            onChange={(e) => changeZoom(Number(e.target.value))}
          />
          <button
            type="button"
            className="crop-zoom-btn"
            aria-label="Zoom in"
            onClick={() => changeZoom(zoom + 0.25)}
          >
            +
          </button>
        </div>

        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!dims || saving}>
            Save Photo
          </Button>
        </div>
      </div>
    </div>
  );
}
