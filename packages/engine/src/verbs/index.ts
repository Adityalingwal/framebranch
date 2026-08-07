import type {
  ApplyOptions,
  ApplyResult,
  Command,
  EngineCommand,
  Timeline,
} from "../types";
import {
  applyAddMediaClip,
  applyAddTextClip,
  applyDeleteClip,
  applyRippleDelete,
  applyRestoreClip,
} from "./clip-lifecycle";
import { applyPropertyChange } from "./property-change";
import { applyMove, applySlip, applySplit, applyTrim } from "./transform-clip";

export {
  PROPERTY_APPLICABILITY,
  PROPERTY_DEFAULTS,
  TEXT_FONT_WHITELIST,
  TEXT_STYLE_DEFAULTS,
} from "./shared";

/**
 * Apply one PUBLIC command to a timeline. Pure function: returns a typed
 * error, a no-change success , or the new timeline + inverse.
 */
export function applyCommand(
  timeline: Timeline,
  command: Command,
  options?: ApplyOptions,
): ApplyResult {
  return applyEngineCommand(timeline, command, options);
}

/**
 * Engine-internal apply: additionally accepts the restore form
 * so inverse (undo) step lists can be executed. NOT exported via index.
 */
export function applyEngineCommand(
  timeline: Timeline,
  command: EngineCommand,
  options?: ApplyOptions,
): ApplyResult {
  switch (command.op) {
    case "addClip":
      if ("clip" in command) return applyRestoreClip(timeline, command);
      if ("mediaRefId" in command)
        return applyAddMediaClip(timeline, command, options);
      return applyAddTextClip(timeline, command, options);
    case "deleteClip":
      return applyDeleteClip(timeline, command);
    case "move":
      return applyMove(timeline, command);
    case "trim":
      return applyTrim(timeline, command);
    case "slip":
      return applySlip(timeline, command);
    case "propertyChange":
      return applyPropertyChange(timeline, command);
    case "rippleDelete":
      return applyRippleDelete(timeline, command);
    case "split":
      return applySplit(timeline, command);
  }
}
