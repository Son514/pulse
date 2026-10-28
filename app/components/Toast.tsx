"use client";

import { Info } from "lucide-react";

export interface ToastData {
  id: number;
  text: string;
}

export default function Toast({ toast }: { toast: ToastData | null }) {
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[4.75rem] z-50 flex justify-center px-4 md:top-6"
    >
      {toast && (
        <div
          key={toast.id}
          className="toast-in flex items-center gap-2 rounded-full border border-white/10 bg-panel/85 px-4 py-2 text-sm text-haze shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <Info aria-hidden className="h-4 w-4 shrink-0 text-pulse" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
