import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-[80]">
      <DialogBackdrop className="fixed inset-0 bg-[rgba(16,16,20,0.28)] backdrop-blur-[10px] backdrop-saturate-[1.4]" />
      <div className="fixed inset-0 flex items-start justify-center px-5 pt-[12vh] pb-8 max-sm:px-3 max-sm:pt-[10vh]">
        <DialogPanel className="flex max-h-[min(68vh,640px)] w-[min(520px,100%)] flex-col overflow-hidden rounded-2xl border border-line-strong bg-[rgba(255,255,255,0.97)] shadow-lg animate-insert-pop focus:outline-none">
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
