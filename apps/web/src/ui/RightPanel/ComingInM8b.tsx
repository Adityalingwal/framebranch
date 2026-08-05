export function ComingInM8b({ label }: { label: string }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "var(--fb-text-mute)",
        fontSize: 12,
        padding: 24,
      }}
    >
      {label} is coming in M8b.
    </div>
  );
}
