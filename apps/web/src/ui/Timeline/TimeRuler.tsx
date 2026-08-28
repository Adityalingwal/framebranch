const RULER_HEIGHT = 32;
const MAJOR_TICK_H = 10; // tick at every second
const MINOR_TICK_H = 5; // tick at every 0.5s
const MICRO_TICK_H = 3; // tick at every 0.25s

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

            {/* Label — only on major (per-second) marks */}
            {isMajor && (
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
                {formatRulerTime(s)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatRulerTime(seconds: number) {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
