import { formatRulerLabel, rulerLabelStep } from "../../lib/format";

const RULER_HEIGHT = 32;
const MAJOR_TICK_H = 10; // tick at every second
const MINOR_TICK_H = 5; // tick at every 0.5s
const MICRO_TICK_H = 3; // tick at every 0.25s

/**
 * The shared ruler — the editing timeline AND the Compare lanes (B2 §2.3)
 * draw the same one. Labels are 4-part `HH:MM:SS:FF` (C5 C-3); how OFTEN a
 * major carries a label depends on the zoom, so two labels never collide.
 */
export function TimeRuler({
  projectRate,
  endFrame,
  pxPerSecond,
}: {
  projectRate: number;
  endFrame: number;
  pxPerSecond: number;
}) {
  const totalSeconds = Math.ceil(endFrame / projectRate) + 1;
  const widthPx = totalSeconds * pxPerSecond;
  const labelStep = rulerLabelStep(pxPerSecond);

  // Build tick marks: 0s, 0.25s, 0.5s, 0.75s, 1s, …
  const STEP = pxPerSecond >= 90 ? 0.25 : 0.5;
  const ticks = Array.from(
    { length: Math.floor(totalSeconds / STEP) + 1 },
    (_, i) => i * STEP,
  );

  return (
    <div
      style={{
        position: "relative",
        width: widthPx,
        height: RULER_HEIGHT,
        background: "rgba(0,0,0,0.18)",
        borderBottom: "1px solid rgba(255,255,255,.07)",
        borderRadius: "4px 4px 0 0",
        overflow: "visible",
      }}
    >
      {ticks.map((s) => {
        const isMajor = Number.isInteger(s); // 0s, 1s, 2s…
        const isMinor = !isMajor && (s * 2) % 1 === 0; // 0.5s, 1.5s…
        // remaining are micro (0.25s, 0.75s…)

        const tickH = isMajor
          ? MAJOR_TICK_H
          : isMinor
            ? MINOR_TICK_H
            : MICRO_TICK_H;
        const tickOpacity = isMajor ? 0.32 : isMinor ? 0.16 : 0.09;
        const left = s * pxPerSecond;

        return (
          <div key={s} style={{ position: "absolute", left, bottom: 0 }}>
            {/* Tick mark — drawn from the bottom edge upward */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: 1,
                height: tickH,
                background: `rgba(255,255,255,${tickOpacity})`,
              }}
            />

            {/* Label — on majors only, and only every `labelStep` seconds
                so a 4-part label never overlaps its neighbour. */}
            {isMajor && s % labelStep === 0 && (
              <span
                style={{
                  position: "absolute",
                  bottom: tickH + 3,
                  left: 3,
                  fontSize: 9,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.03em",
                  color: "var(--fb-text-dim)",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                {formatRulerLabel(s, projectRate)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
