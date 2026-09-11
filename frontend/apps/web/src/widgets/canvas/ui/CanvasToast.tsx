import { motion } from "framer-motion";

export function CanvasToast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <motion.div
      key={message}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 26 }}
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
        overflow: "hidden",
      }}
    >
      {message}
      <motion.span
        aria-hidden
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 2, ease: "linear" }}
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 2,
          width: "100%",
          transformOrigin: "left",
          background: "rgba(250,250,250,0.4)",
        }}
      />
    </motion.div>
  );
}
