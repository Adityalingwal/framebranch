"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  CaretDown,
  LinkSimple,
} from "@phosphor-icons/react";

import type {
  Clip,
  MediaKind,
  Position,
  PropertyValue,
  TextClip,
  TextFont,
  TextStyle,
} from "@framebranch/engine";

import { isTextClip, type AnyClip } from "../lib/clip-helpers";
import { toSeconds } from "../lib/format";
import { textInput } from "./styles";
import { CustomSelect } from "./CustomSelect";

const DEFAULT_POSITION: Position = { x: 0, y: 0 };
const FONTS: TextFont[] = ["Arial", "Georgia", "Courier New"];
// Mirrors packages/engine/src/verbs.ts's own bounds (MAX_TEXT_CONTENT, the
// textStyle.size 8-200 check) — controls must not be able to emit
// out-of-range values — HTML min/max alone don't constrain typed input,
// so this is enforced in JS on commit.
const MAX_TEXT_CONTENT = 500;
const MIN_TEXT_SIZE = 8;
const MAX_TEXT_SIZE = 200;
const DEFAULT_TEXT_STYLE: TextStyle = {
  font: "Arial",
  size: 48,
  color: "#ffffff",
};

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
  displayName,
  mediaKind,
  onPropertyChange,
  disabled,
  resetToken,
}: {
  clip: AnyClip | null;
  displayName?: string;
  mediaKind?: MediaKind;
  resetToken?: number;
  onPropertyChange: (
    clipId: string,
    property:
      "volume" | "opacity" | "scale" | "position" | "textContent" | "textStyle",
    value: PropertyValue,
  ) => void;
  disabled?: boolean;
}) {
  if (!clip) {
    return (
      <div className="surface" style={{ padding: 14 }}>
        <Empty>No clip selected</Empty>
      </div>
    );
  }

  return (
    <div
      // Remounts on `resetToken` too — a rejected propertyChange rolls the
      // cache back to a value it already was, so no prop here structurally
      // "changes"; without this, a control's own local-state re-sync (which
      // only fires on a genuine value change) would never fire, and a
      // rejected/out-of-range input would stay stuck on screen forever.
      key={`${clip.id}-${resetToken ?? 0}`}
      className="surface clip-settings"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        boxSizing: "border-box",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div className="clip-settings-header">
        <h2>{mediaKind === "audio" ? "Audio settings" : "Clip settings"}</h2>
        <span title={displayName}>{displayName ?? "Selected clip"}</span>
      </div>
      <div className="clip-settings-body">
        {isTextClip(clip) ? (
          <TextControls
            clip={clip}
            disabled={disabled}
            onPropertyChange={onPropertyChange}
          />
        ) : mediaKind === "audio" ? (
          <AudioControls
            clip={clip}
            disabled={disabled}
            onPropertyChange={onPropertyChange}
          />
        ) : (
          <MediaControls
            clip={clip}
            mediaKind={mediaKind}
            disabled={disabled}
            onPropertyChange={onPropertyChange}
          />
        )}
      </div>
    </div>
  );
}

function MediaControls({
  clip,
  mediaKind,
  disabled,
  onPropertyChange,
}: {
  clip: Clip;
  mediaKind?: MediaKind;
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
      <PropertyGroup label="Basic">
        {mediaKind === "video" && (
          <IntSlider
            label="Volume"
            value={volume}
            defaultValue={100}
            changed={volume !== 100}
            disabled={disabled}
            onCommit={(v) => onPropertyChange(clip.id, "volume", v)}
          />
        )}
        <IntSlider
          label="Opacity"
          value={opacity}
          defaultValue={100}
          changed={opacity !== 100}
          disabled={disabled}
          onCommit={(v) => onPropertyChange(clip.id, "opacity", v)}
        />
      </PropertyGroup>
      <PropertyGroup label="Transform">
        <ScaleSlider
          value={scale}
          changed={scale !== 1}
          disabled={disabled}
          onCommit={(v) => onPropertyChange(clip.id, "scale", v)}
        />
        <PositionInputs
          value={pos}
          changed={pos.x !== 0 || pos.y !== 0}
          disabled={disabled}
          onCommit={(v) => onPropertyChange(clip.id, "position", v)}
        />
      </PropertyGroup>
    </>
  );
}

function AudioControls({
  clip,
  disabled,
  onPropertyChange,
}: {
  clip: Clip;
  disabled?: boolean;
  onPropertyChange: (
    clipId: string,
    property: "volume",
    value: PropertyValue,
  ) => void;
}) {
  const volume = clip.properties.volume ?? 100;
  const previousVolume = useRef(volume > 0 ? volume : 100);
  const duration = toSeconds(clip.timelineRange.duration);
  const sourceStart = toSeconds(clip.sourceRange.start);

  useEffect(() => {
    if (volume > 0) previousVolume.current = volume;
  }, [volume]);

  return (
    <>
      <PropertyGroup label="Audio">
        <IntSlider
          label="Volume"
          value={volume}
          defaultValue={100}
          changed={volume !== 100}
          disabled={disabled}
          onCommit={(value) => onPropertyChange(clip.id, "volume", value)}
        />
        <Row label="Mute">
          <button
            type="button"
            role="switch"
            aria-label="Mute clip"
            aria-checked={volume === 0}
            className={`audio-property-toggle${volume === 0 ? " is-active" : ""}`}
            disabled={disabled}
            onClick={() => {
              if (volume > 0) previousVolume.current = volume;
              onPropertyChange(
                clip.id,
                "volume",
                volume === 0 ? previousVolume.current : 0,
              );
            }}
          >
            <span aria-hidden />
            {volume === 0 ? "On" : "Off"}
          </button>
        </Row>
      </PropertyGroup>
      <PropertyGroup label="Clip info">
        <ReadOnlyValue label="Duration" value={formatAudioTime(duration)} />
        <ReadOnlyValue
          label="Source start"
          value={formatAudioTime(sourceStart)}
        />
      </PropertyGroup>
    </>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <Row label={label}>
      <span className="property-readonly-value">{value}</span>
    </Row>
  );
}

function formatAudioTime(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
      <PropertyGroup label="Content">
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
        <Row label="Font" changed={style.font !== DEFAULT_TEXT_STYLE.font}>
          <div className="property-inline-actions">
            <CustomSelect
              value={style.font}
              disabled={disabled}
              ariaLabel="Font"
              className="property-select"
              options={FONTS.map((font) => ({ value: font, label: font }))}
              onChange={(font) =>
                commitStyle({ ...style, font: font as TextFont })
              }
            />
            <ResetFieldButton
              label="Reset font"
              disabled={disabled || style.font === DEFAULT_TEXT_STYLE.font}
              onClick={() =>
                commitStyle({ ...style, font: DEFAULT_TEXT_STYLE.font })
              }
            />
          </div>
        </Row>
        <Row label="Size" changed={style.size !== DEFAULT_TEXT_STYLE.size}>
          <div className="property-inline-actions">
            <input
              type="number"
              value={style.size}
              disabled={disabled}
              min={MIN_TEXT_SIZE}
              max={MAX_TEXT_SIZE}
              style={{ ...textInput, width: 70 }}
              onChange={(e) =>
                setStyle({ ...style, size: Number(e.target.value) })
              }
              onBlur={() => {
                const clamped = Math.min(
                  MAX_TEXT_SIZE,
                  Math.max(
                    MIN_TEXT_SIZE,
                    Math.round(style.size) || MIN_TEXT_SIZE,
                  ),
                );
                commitStyle({ ...style, size: clamped });
              }}
            />
            <ResetFieldButton
              label="Reset size"
              disabled={disabled || style.size === DEFAULT_TEXT_STYLE.size}
              onClick={() =>
                commitStyle({ ...style, size: DEFAULT_TEXT_STYLE.size })
              }
            />
          </div>
        </Row>
        <ColorInput
          value={style.color}
          changed={style.color !== DEFAULT_TEXT_STYLE.color}
          defaultValue={DEFAULT_TEXT_STYLE.color}
          disabled={disabled}
          onCommit={(color) => commitStyle({ ...style, color })}
        />
      </PropertyGroup>
      <PropertyGroup label="Appearance">
        <IntSlider
          label="Opacity"
          value={opacity}
          defaultValue={100}
          changed={opacity !== 100}
          disabled={disabled}
          onCommit={(v) => onPropertyChange(clip.id, "opacity", v)}
        />
      </PropertyGroup>
      <PropertyGroup label="Transform">
        <PositionInputs
          value={pos}
          changed={pos.x !== 0 || pos.y !== 0}
          disabled={disabled}
          onCommit={(v) => onPropertyChange(clip.id, "position", v)}
        />
      </PropertyGroup>
    </>
  );
}

function IntSlider({
  label,
  value,
  defaultValue,
  changed,
  disabled,
  onCommit,
  compact = false,
}: {
  label: string;
  value: number;
  defaultValue?: number;
  changed?: boolean;
  disabled?: boolean;
  onCommit: (value: number) => void;
  compact?: boolean;
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

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span
          style={{
            color: "var(--fb-text-mute)",
            fontSize: 10.5,
            flexShrink: 0,
            width: 26,
          }}
        >
          {label}
        </span>
        <input
          ref={ref}
          type="range"
          min={0}
          max={100}
          step={1}
          value={live}
          disabled={disabled}
          style={{ flex: 1, minWidth: 0, accentColor: "var(--fb-accent-to)" }}
          onInput={(e) => setLive(Number((e.target as HTMLInputElement).value))}
        />
        <span
          style={{
            width: 30,
            textAlign: "right",
            fontSize: 10.5,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {live}%
        </span>
      </div>
    );
  }

  return (
    <Row label={label} changed={changed}>
      <div className="property-inline-actions">
        <input
          ref={ref}
          type="range"
          min={0}
          max={100}
          step={1}
          value={live}
          disabled={disabled}
          style={{ flex: 1, "--val": `${live}%` } as React.CSSProperties}
          onInput={(e) => setLive(Number((e.target as HTMLInputElement).value))}
        />
        <span
          style={{
            width: 34,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {live}%
        </span>
        {defaultValue !== undefined && (
          <ResetFieldButton
            label={`Reset ${label.toLowerCase()}`}
            disabled={disabled || value === defaultValue}
            onClick={() => onCommit(defaultValue)}
          />
        )}
      </div>
    </Row>
  );
}

function ScaleSlider({
  value,
  changed,
  disabled,
  onCommit,
}: {
  value: number;
  changed?: boolean;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <Row label="Scale" changed={changed}>
      <div className="transform-field-actions">
        <span
          className="scale-link-lock"
          title="Proportions locked — scale is uniform"
          aria-label="Scale proportions locked"
        >
          <LinkSimple size={13} weight="bold" aria-hidden />
        </span>
        <ScrubbableNumberField
          label="S"
          ariaLabel="Scale"
          value={value}
          step={0.1}
          min={0.1}
          max={10}
          decimals={1}
          suffix="x"
          disabled={disabled}
          onCommit={onCommit}
        />
        <ResetFieldButton
          label="Reset scale"
          disabled={disabled || value === 1}
          onClick={() => onCommit(1)}
        />
      </div>
    </Row>
  );
}

function ColorInput({
  value,
  defaultValue,
  changed,
  disabled,
  onCommit,
}: {
  value: string;
  defaultValue: string;
  changed?: boolean;
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
    <Row label="Color" changed={changed}>
      <div className="property-inline-actions">
        <input
          ref={ref}
          type="color"
          value={live}
          disabled={disabled}
          style={{
            width: 40,
            height: 24,
            border: "none",
            background: "none",
            cursor: "pointer",
          }}
          onInput={(e) => setLive((e.target as HTMLInputElement).value)}
        />
        <ResetFieldButton
          label="Reset color"
          disabled={disabled || value === defaultValue}
          onClick={() => onCommit(defaultValue)}
        />
      </div>
    </Row>
  );
}

function PositionInputs({
  value,
  changed,
  disabled,
  onCommit,
}: {
  value: Position;
  changed?: boolean;
  disabled?: boolean;
  onCommit: (value: Position) => void;
}) {
  return (
    <Row label="Position" changed={changed}>
      <div className="position-inputs">
        <ScrubbableNumberField
          label="X"
          ariaLabel="Position X"
          value={value.x}
          step={1}
          disabled={disabled}
          onCommit={(x) => onCommit({ ...value, x })}
        />
        <ScrubbableNumberField
          label="Y"
          ariaLabel="Position Y"
          value={value.y}
          step={1}
          disabled={disabled}
          onCommit={(y) => onCommit({ ...value, y })}
        />
        <ResetFieldButton
          label="Reset position"
          disabled={disabled || (value.x === 0 && value.y === 0)}
          onClick={() => onCommit(DEFAULT_POSITION)}
        />
      </div>
    </Row>
  );
}

function ResetFieldButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="transform-reset-button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <ArrowCounterClockwise size={13} weight="bold" aria-hidden />
    </button>
  );
}

function ScrubbableNumberField({
  label,
  ariaLabel,
  value,
  step,
  min = -100000,
  max = 100000,
  decimals = 0,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [scrubbing, setScrubbing] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => setDraft(String(value)), [value]);

  function normalize(next: number) {
    const bounded = Math.min(max, Math.max(min, next));
    return Number(bounded.toFixed(decimals));
  }

  function commitDraft() {
    const parsed = Number(draft);
    const next = normalize(Number.isFinite(parsed) ? parsed : value);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  function stepBy(direction: number, multiplier = 1) {
    const current = Number(draft);
    const base = Number.isFinite(current) ? current : value;
    const next = normalize(base + direction * step * multiplier);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  function beginScrub(event: React.PointerEvent<HTMLSpanElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startValue = value;
    let latest = value;
    setScrubbing(true);

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      latest = normalize(startValue + delta * step);
      setDraft(String(latest));
    };
    const onUp = () => {
      setScrubbing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (latest !== value) onCommit(latest);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  const numericDraft = Number(draft);
  const formatted = focused
    ? draft
    : `${(Number.isFinite(numericDraft) ? numericDraft : value).toFixed(decimals)}${suffix ?? ""}`;

  return (
    <label className={`scrub-field${scrubbing ? " is-scrubbing" : ""}`}>
      <span
        className="scrub-field-label"
        title={`Drag to adjust ${ariaLabel.toLowerCase()}`}
        onPointerDown={beginScrub}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={formatted}
        disabled={disabled}
        onFocus={() => {
          setFocused(true);
          setDraft(String(value));
        }}
        onChange={(event) =>
          setDraft(event.target.value.replace(suffix ?? "", ""))
        }
        onBlur={() => {
          setFocused(false);
          commitDraft();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            stepBy(event.key === "ArrowUp" ? 1 : -1, event.shiftKey ? 10 : 1);
          } else if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function PropertyGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="property-group" open>
      <summary id={`property-${label}`}>
        <CaretDown size={12} weight="bold" aria-hidden />
        {label}
      </summary>
      <div>{children}</div>
    </details>
  );
}

function Row({
  label,
  children,
  changed = false,
}: {
  label: string;
  children: React.ReactNode;
  changed?: boolean;
}) {
  return (
    <div className={`property-row${changed ? " is-changed" : ""}`}>
      <span className="property-row-label">{label}</span>
      <span className="property-row-control">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: "var(--fb-text-mute)",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}
