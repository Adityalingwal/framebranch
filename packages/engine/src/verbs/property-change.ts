import type {
  ApplyError,
  ApplyResult,
  Clip,
  EngineCommand,
  Position,
  PropertyChangeCommand,
  TextClip,
  TextStyle,
  Timeline,
} from "../types";
import {
  type AnyClip,
  type KindColumn,
  PROPERTY_APPLICABILITY,
  PROPERTY_DEFAULTS,
  err,
  getMedia,
  isTextClip,
  locateClip,
  noChange,
  ok,
  trackClips,
  validateTextContent,
  validateTextStyleField,
  withTrackClips,
} from "./shared";

function eqPosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function eqTextStyle(a: TextStyle, b: TextStyle): boolean {
  return a.font === b.font && a.size === b.size && a.color === b.color;
}

function validateFinitePosition(value: unknown): value is Position {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Position).x === "number" &&
    typeof (value as Position).y === "number" &&
    Number.isFinite((value as Position).x) &&
    Number.isFinite((value as Position).y)
  );
}

function validateFullTextStyle(value: unknown): ApplyError | null {
  if (typeof value !== "object" || value === null) {
    return err(
      "E_INVALID_VALUE",
      "textStyle must be a {font, size, color} object",
    );
  }
  const style = value as Partial<TextStyle>;
  if (
    style.font === undefined ||
    style.size === undefined ||
    style.color === undefined
  ) {
    return err(
      "E_INVALID_VALUE",
      "textStyle must include font, size and color",
    );
  }
  for (const key of ["font", "size", "color"] as const) {
    const e = validateTextStyleField(key, style[key] as TextStyle[typeof key]);
    if (e) return e;
  }
  return null;
}

export function applyPropertyChange(
  tl: Timeline,
  cmd: PropertyChangeCommand,
): ApplyResult {
  const loc = locateClip(tl, cmd.clipId);
  if (!loc) return err("E_CLIP_NOT_FOUND", `clip ${cmd.clipId} not found`);
  const clip = loc.clip;

  // Column of the 6×4 matrix: text clips → "text"; media clips → media kind.
  let column: KindColumn;
  if (isTextClip(clip)) {
    column = "text";
  } else {
    const media = getMedia(tl, clip.mediaRefId);
    if (!media)
      return err("E_MEDIA_NOT_FOUND", `media ${clip.mediaRefId} not found`);
    column = media.kind;
  }

  if (!PROPERTY_APPLICABILITY[cmd.property][column]) {
    return err(
      "E_PROPERTY_NOT_APPLICABLE",
      `${cmd.property} is not applicable to a ${column} clip`,
    );
  }

  const replaceClip = (updated: AnyClip): Timeline =>
    withTrackClips(
      tl,
      loc.track.id,
      trackClips(loc.track).map((c) => (c.id === cmd.clipId ? updated : c)),
    );

  const inverse = (
    oldValue: PropertyChangeCommand["value"],
  ): EngineCommand[] => [
    {
      op: "propertyChange",
      clipId: cmd.clipId,
      property: cmd.property,
      value: oldValue,
    },
  ];

  switch (cmd.property) {
    case "volume":
    case "opacity": {
      const v = cmd.value;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) {
        return err(
          "E_INVALID_VALUE",
          `${cmd.property} must be an integer 0-100`,
        );
      }
      const current =
        (
          clip.properties as { volume?: number; opacity?: number } | undefined
        )?.[cmd.property] ?? PROPERTY_DEFAULTS[cmd.property];
      if (v === current) return noChange(tl); // A4 (defaults materialized, B3.1)
      const updated: AnyClip = {
        ...clip,
        properties: { ...(clip.properties ?? {}), [cmd.property]: v },
      };
      return ok(replaceClip(updated), inverse(current));
    }
    case "scale": {
      const v = cmd.value;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0.1 || v > 10) {
        return err("E_INVALID_VALUE", "scale must be a number 0.1-10");
      }
      const mediaClip = clip as Clip; // matrix guarantees non-text here
      const current = mediaClip.properties.scale ?? PROPERTY_DEFAULTS.scale;
      if (v === current) return noChange(tl);
      const updated: Clip = {
        ...mediaClip,
        properties: { ...mediaClip.properties, scale: v },
      };
      return ok(replaceClip(updated), inverse(current));
    }
    case "position": {
      const v = cmd.value;
      if (!validateFinitePosition(v)) {
        return err(
          "E_INVALID_VALUE",
          "position must be {x, y} with finite numbers",
        );
      }
      const current =
        (clip.properties as { position?: Position } | undefined)?.position ??
        PROPERTY_DEFAULTS.position;
      if (eqPosition(v, current)) return noChange(tl);
      const updated: AnyClip = {
        ...clip,
        properties: { ...(clip.properties ?? {}), position: v },
      };
      return ok(replaceClip(updated), inverse(current));
    }
    case "textContent": {
      const contentErr = validateTextContent(cmd.value);
      if (contentErr) return contentErr;
      const textClip = clip as TextClip; // matrix guarantees text here
      const v = cmd.value as string;
      if (v === textClip.textContent) return noChange(tl);
      const updated: TextClip = { ...textClip, textContent: v };
      return ok(replaceClip(updated), inverse(textClip.textContent));
    }
    case "textStyle": {
      const styleErr = validateFullTextStyle(cmd.value);
      if (styleErr) return styleErr;
      const textClip = clip as TextClip;
      const v = cmd.value as TextStyle;
      if (eqTextStyle(v, textClip.textStyle)) return noChange(tl);
      const updated: TextClip = { ...textClip, textStyle: v };
      return ok(replaceClip(updated), inverse(textClip.textStyle));
    }
  }
}
