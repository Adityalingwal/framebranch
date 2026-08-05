/**
 * IconRail.tsx — the thin left rail from the locked layout (§6). M8a is a
 * single page with nothing else to navigate to, so per the "zero
 * illustration/art" lock this stays functional and minimal: just the
 * app's mark, no decorative icon set invented for screens that don't
 * exist yet.
 */
export function IconRail() {
  return (
    <div
      className="surface"
      style={{
        width: 44,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 12,
        borderRadius: 0,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: "var(--fb-radius-sm)",
          background:
            "linear-gradient(180deg, var(--fb-accent-from), var(--fb-accent-to))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 500,
          color: "#fff",
        }}
      >
        F
      </div>
    </div>
  );
}
