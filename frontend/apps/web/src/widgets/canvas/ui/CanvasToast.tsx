export function CanvasToast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 16,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(24,24,27,0.92)",
        color: "#FAFAFA",
        fontSize: 13,
        zIndex: 60,
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}
