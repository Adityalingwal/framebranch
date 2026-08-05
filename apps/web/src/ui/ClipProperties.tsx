import { isTextClip, type AnyClip } from "../lib/clip-helpers";

const DEFAULT_POSITION = { x: 0, y: 0 };

/**
 * §8.2 — the six-property whitelist, read-only, applicable-to-kind only.
 * No editing controls in M8a (locked).
 */
export function ClipProperties({ clip }: { clip: AnyClip | null }) {
  if (!clip) {
    return (
      <div className="surface" style={{ padding: 14 }}>
        <Empty>No clip selected</Empty>
      </div>
    );
  }

  if (isTextClip(clip)) {
    const pos = clip.properties?.position ?? DEFAULT_POSITION;
    const opacity = clip.properties?.opacity ?? 100;
    return (
      <div className="surface" style={{ padding: 14 }}>
        <Row label="Text content">
          <span style={{ color: "var(--fb-text-body-2)" }}>
            &ldquo;{clip.textContent}&rdquo;
          </span>
        </Row>
        <Row label="Text style">
          <span>
            {clip.textStyle.font}, {clip.textStyle.size}px
          </span>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 3,
              background: clip.textStyle.color,
              marginLeft: 8,
              verticalAlign: "middle",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.15)",
            }}
          />
          <span style={{ marginLeft: 4 }}>{clip.textStyle.color}</span>
        </Row>
        <Row label="Opacity">{opacity}%</Row>
        <Row label="Position">
          x {pos.x}, y {pos.y}
        </Row>
      </div>
    );
  }

  const volume = clip.properties.volume ?? 100;
  const opacity = clip.properties.opacity ?? 100;
  const scale = clip.properties.scale ?? 1;
  const pos = clip.properties.position ?? DEFAULT_POSITION;

  return (
    <div className="surface" style={{ padding: 14 }}>
      <Row label="Volume">{volume}%</Row>
      <Row label="Opacity">{opacity}%</Row>
      <Row label="Scale">{scale}x</Row>
      <Row label="Position">
        x {pos.x}, y {pos.y}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        fontSize: 12,
        borderBottom: "1px solid rgba(255,255,255,.04)",
      }}
    >
      <span style={{ color: "var(--fb-text-mute)" }}>{label}</span>
      <span style={{ color: "var(--fb-text-body)" }}>{children}</span>
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
