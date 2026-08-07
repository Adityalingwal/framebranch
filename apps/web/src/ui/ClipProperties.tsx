"use client";

import { useEffect, useRef, useState } from "react";

import type {
  Clip,
  Position,
  PropertyValue,
  TextClip,
  TextFont,
  TextStyle,
} from "@framebranch/engine";

import { isTextClip, type AnyClip } from "../lib/clip-helpers";
import { dangerButton, secondaryButton, textInput } from "./styles";

const DEFAULT_POSITION: Position = { x: 0, y: 0 };
const FONTS: TextFont[] = ["Arial", "Georgia", "Courier New"];
// Mirrors packages/engine/src/verbs.ts's own bounds (MAX_TEXT_CONTENT, the
// textStyle.size 8-200 check) — controls must not be able to emit
// out-of-range values — HTML min/max alone don't constrain typed input,
// so this is enforced in JS on commit.
const MAX_TEXT_CONTENT = 500;
const MIN_TEXT_SIZE = 8;
const MAX_TEXT_SIZE = 200;

/**
 * §5/§8.2 — the six-property whitelist, now editable. Every whitelisted
 * property is shown for every clip it can structurally carry (the engine's
 * `Clip`/`TextClip` types already narrow that — text only ever has
 * opacity/position). Kind-based applicability beyond that
 * (e.g. "no volume on an image") is NOT filtered here — that repeats
 * the same decision arrived at earlier: an inapplicable edit reaches the server and
 * comes back as a normal, honestly-shown `E_PROPERTY_NOT_APPLICABLE`
 * rollback — same pattern the wrapper already uses for every verb error.
 *
 * Split is the one exception with an explicit lock (§5: "a playhead/marker
 * + a Split action") — its button is disabled whenever the playhead is not
 * strictly inside the selected clip, which is knowable client-side.
 */
export function ClipProperties({
  clip,
  playheadFrame,
  onPropertyChange,
  onDelete,
  onRippleDelete,
  onSplit,
  disabled,
  resetToken,
}: {
  clip: AnyClip | null;
  playheadFrame: number;
  resetToken?: number;
  onPropertyChange: (
    clipId: string,
    property:
      | "volume"
      | "opacity"
      | "scale"
      | "position"
      | "textContent"
      | "textStyle",
    value: PropertyValue,
  ) => void;
  onDelete: (clipId: string) => void;
  onRippleDelete: (clipId: string) => void;
  onSplit: (clipId: string, atFrame: number) => void;
  disabled?: boolean;
}) {
  if (!clip) {
    return (
      <div className="surface" style={{ padding: 14 }}>
        <Empty>No clip selected</Empty>
      </div>
    );
  }

  const start = clip.timelineRange.start.value;
  const end = start + clip.timelineRange.duration.value;
  // A3.1c: both edges exclusive — a boundary cut is E_SPLIT_AT_BOUNDARY.
  const canSplit = playheadFrame > start && playheadFrame < end;

  return (
    <div
      // Remounts on `resetToken` too — a rejected propertyChange rolls the
      // cache back to a value it already was, so no prop here structurally
      // "changes"; without this, a control's own local-state re-sync (which
      // only fires on a genuine value change) would never fire, and a
      // rejected/out-of-range input would stay stuck on screen forever.
      key={`${clip.id}-${resetToken ?? 0}`}
      className="surface"
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
    >
      {isTextClip(clip) ? (
        <TextControls
          clip={clip}
          disabled={disabled}
          onPropertyChange={onPropertyChange}
        />
      ) : (
        <MediaControls
          clip={clip}
          disabled={disabled}
          onPropertyChange={onPropertyChange}
        />
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,.05)",
        }}
      >
        <button
          type="button"
          style={{
            ...secondaryButton,
            padding: "4px 12px",
            fontSize: 11,
            ...(disabled || !canSplit
              ? { opacity: 0.45, cursor: "not-allowed" }
              : {}),
          }}
          disabled={disabled || !canSplit}
          title={
            canSplit
              ? "Split at the playhead"
              : "Move the playhead inside this clip first"
          }
          onClick={() => onSplit(clip.id, playheadFrame)}
        >
          Split at playhead
        </button>
        <button
          type="button"
          style={{
            ...secondaryButton,
            padding: "4px 12px",
            fontSize: 11,
            ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
          }}
          disabled={disabled}
          onClick={() => onRippleDelete(clip.id)}
        >
          Delete and close gap
        </button>
        <button
          type="button"
          style={{
            ...dangerButton,
            padding: "4px 12px",
            fontSize: 11,
            ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
          }}
          disabled={disabled}
          onClick={() => onDelete(clip.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function MediaControls({
  clip,
  disabled,
  onPropertyChange,
}: {
  clip: Clip;
  disabled?: boolean;
  onPropertyChange: (
    clipId: string,
    property: "volume" | "opacity" | "scale" | "position",
    value: PropertyValue,
  ) => void;
}) {
  const volume = clip.properties.volume ?? 100;
  const opacity = clip.properties.opacity ?? 100;
  const scale = clip.properties.scale ?? 1;
  const pos = clip.properties.position ?? DEFAULT_POSITION;

  return (
    <>
      <IntSlider
        label="Volume"
        value={volume}
        disabled={disabled}
        onCommit={(v) => onPropertyChange(clip.id, "volume", v)}
      />
      <IntSlider
        label="Opacity"
        value={opacity}
        disabled={disabled}
        onCommit={(v) => onPropertyChange(clip.id, "opacity", v)}
      />
      <ScaleSlider
        value={scale}
        disabled={disabled}
        onCommit={(v) => onPropertyChange(clip.id, "scale", v)}
      />
      <PositionInputs
        value={pos}
        disabled={disabled}
        onCommit={(v) => onPropertyChange(clip.id, "position", v)}
      />
    </>
  );
}

function TextControls({
  clip,
  disabled,
  onPropertyChange,
}: {
  clip: TextClip;
  disabled?: boolean;
  onPropertyChange: (
    clipId: string,
    property: "opacity" | "position" | "textContent" | "textStyle",
    value: PropertyValue,
  ) => void;
}) {
  const opacity = clip.properties?.opacity ?? 100;
  const pos = clip.properties?.position ?? DEFAULT_POSITION;
  const [content, setContent] = useState(clip.textContent);
  const [style, setStyle] = useState<TextStyle>(clip.textStyle);
  // Same re-sync reasoning as IntSlider/ScaleSlider/PositionInputs above.
  useEffect(() => setContent(clip.textContent), [clip.textContent]);
  useEffect(() => setStyle(clip.textStyle), [clip.textStyle]);

  function commitStyle(next: TextStyle) {
    setStyle(next);
    // textStyle is validated as a COMPLETE {font,size,color} object — always
    // send all three (verbs.ts `validateFullTextStyle`).
    onPropertyChange(clip.id, "textStyle", next);
  }

  return (
    <>
      <Row label="Text content">
        <textarea
          value={content}
          disabled={disabled}
          rows={2}
          style={{ ...textInput, resize: "vertical" }}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => {
            const clamped = content.slice(0, MAX_TEXT_CONTENT);
            if (clamped !== content) setContent(clamped);
            if (clamped !== clip.textContent) {
              onPropertyChange(clip.id, "textContent", clamped);
            }
          }}
        />
      </Row>
      <Row label="Font">
        <select
          value={style.font}
          disabled={disabled}
          style={{ ...textInput, width: "auto" }}
          onChange={(e) => commitStyle({ ...style, font: e.target.value as TextFont })}
        >
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Size">
        <input
          type="number"
          value={style.size}
          disabled={disabled}
          min={MIN_TEXT_SIZE}
          max={MAX_TEXT_SIZE}
          style={{ ...textInput, width: 70 }}
          onChange={(e) => setStyle({ ...style, size: Number(e.target.value) })}
          onBlur={() => {
            const clamped = Math.min(
              MAX_TEXT_SIZE,
              Math.max(MIN_TEXT_SIZE, Math.round(style.size) || MIN_TEXT_SIZE),
            );
            commitStyle({ ...style, size: clamped });
          }}
        />
      </Row>
      <ColorInput
        value={style.color}
        disabled={disabled}
        onCommit={(color) => commitStyle({ ...style, color })}
      />
      <IntSlider
        label="Opacity"
        value={opacity}
        disabled={disabled}
        onCommit={(v) => onPropertyChange(clip.id, "opacity", v)}
      />
      <PositionInputs
        value={pos}
        disabled={disabled}
        onCommit={(v) => onPropertyChange(clip.id, "position", v)}
      />
    </>
  );
}

function IntSlider({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [live, setLive] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  // Re-sync when the AUTHORITATIVE value changes from outside a drag (a
  // server correction after E_STALE_REV, another tab's edit, a rollback):
  // without this the slider can freeze on a value the server rejected.
  useEffect(() => setLive(value), [value]);
  // Commit on the native "change" event (fires once, on release/keystep) —
  // NOT React's onChange, which for range inputs aliases the continuous
  // "input" event and would fire once per tick of the drag.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = () => {
      const v = Number(el.value);
      if (v !== value) onCommit(v);
    };
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, [value, onCommit]);
  return (
    <Row label={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        <input
          ref={ref}
          type="range"
          min={0}
          max={100}
          step={1}
          value={live}
          disabled={disabled}
          style={{ flex: 1 }}
          onInput={(e) => setLive(Number((e.target as HTMLInputElement).value))}
        />
        <span style={{ width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {live}%
        </span>
      </div>
    </Row>
  );
}

function ScaleSlider({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [live, setLive] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setLive(value), [value]);
  // Same native-"change"-not-React-onChange reasoning as IntSlider above.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = () => {
      const v = Math.round(Number(el.value) * 10) / 10;
      if (v !== value) onCommit(v);
    };
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, [value, onCommit]);
  return (
    <Row label="Scale">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        <input
          ref={ref}
          type="range"
          min={0.1}
          max={10}
          step={0.1}
          value={live}
          disabled={disabled}
          style={{ flex: 1 }}
          onInput={(e) => setLive(Number((e.target as HTMLInputElement).value))}
        />
        <span style={{ width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {live.toFixed(1)}x
        </span>
      </div>
    </Row>
  );
}

function ColorInput({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [live, setLive] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setLive(value), [value]);
  // Same native-"change"-not-React-onChange reasoning as IntSlider above —
  // Chrome's color picker also fires "input" continuously while dragging.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = () => {
      if (el.value !== value) onCommit(el.value);
    };
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, [value, onCommit]);
  return (
    <Row label="Color">
      <input
        ref={ref}
        type="color"
        value={live}
        disabled={disabled}
        style={{ width: 40, height: 24, border: "none", background: "none", cursor: "pointer" }}
        onInput={(e) => setLive((e.target as HTMLInputElement).value)}
      />
    </Row>
  );
}

function PositionInputs({
  value,
  disabled,
  onCommit,
}: {
  value: Position;
  disabled?: boolean;
  onCommit: (value: Position) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <Row label="Position">
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="number"
          value={local.x}
          disabled={disabled}
          style={{ ...textInput, width: 60 }}
          onChange={(e) => setLocal({ ...local, x: Number(e.target.value) })}
          onBlur={() => {
            if (local.x !== value.x || local.y !== value.y) onCommit(local);
          }}
        />
        <input
          type="number"
          value={local.y}
          disabled={disabled}
          style={{ ...textInput, width: 60 }}
          onChange={(e) => setLocal({ ...local, y: Number(e.target.value) })}
          onBlur={() => {
            if (local.x !== value.x || local.y !== value.y) onCommit(local);
          }}
        />
      </div>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        padding: "6px 0",
        fontSize: 12,
        borderBottom: "1px solid rgba(255,255,255,.04)",
      }}
    >
      <span style={{ color: "var(--fb-text-mute)", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "var(--fb-text-body)", flex: 1, textAlign: "right" }}>
        {children}
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: "var(--fb-text-mute)", fontSize: 12, textAlign: "center" }}>
      {children}
    </div>
  );
}
