import { useRef, useState, type DragEvent } from "react";

export function useFileDrop(onUpload: (files: FileList | File[] | null) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const dropHandlers = {
    onDragEnter: (e: DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files);
    },
  };

  return { dragging, dropHandlers };
}
