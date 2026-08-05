import { PX_PER_SECOND } from "./scale";

export function TimeRuler({
  projectRate,
  endFrame,
}: {
  projectRate: number;
  endFrame: number;
}) {
  const totalSeconds = Math.ceil(endFrame / projectRate) + 1;
  const marks = Array.from({ length: totalSeconds + 1 }, (_, i) => i);
  const widthPx = totalSeconds * PX_PER_SECOND;

  return (
    <div
      style={{
        position: "relative",
        width: widthPx,
        height: 20,
        borderBottom: "1px solid rgba(255,255,255,.05)",
      }}
    >
      {marks.map((s) => (
        <div
          key={s}
          style={{
            position: "absolute",
            left: s * PX_PER_SECOND,
            top: 0,
            fontSize: 10,
            color: "var(--fb-text-mute)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {s}s
        </div>
      ))}
    </div>
  );
}
