import { useEffect, useRef } from "react";
import { useCartStore, PosVariant } from "@/lib/pos/cart-store";

interface BarcodeListenerProps {
  catalogMap: Map<string, PosVariant>;
  onScanned?: (barcode: string, found: boolean) => void;
  disabled?: boolean;
}

/**
 * Universal keyboard-wedge barcode scanner listener.
 * Captures rapid bursts of keystrokes (< 50ms interval) terminating with 'Enter'
 * without interfering when the user is actively typing in modal inputs.
 */
export function BarcodeListener({
  catalogMap,
  onScanned,
  disabled = false,
}: BarcodeListenerProps) {
  const scanBuffer = useRef<string>("");
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing inside an interactive input/textarea/select
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.getAttribute("contenteditable") === "true");

      // Exception: If the active input has data-barcode-capture="true"
      const isBarcodeCaptureInput = activeEl?.getAttribute("data-barcode-capture") === "true";

      if (isInputActive && !isBarcodeCaptureInput) {
        return;
      }

      const now = performance.now();
      const interval = now - lastKeyTime.current;
      lastKeyTime.current = now;

      if (e.key === "Enter") {
        const barcode = scanBuffer.current.trim();
        scanBuffer.current = "";

        if (barcode.length >= 3) {
          e.preventDefault();
          const found = useCartStore.getState().scanBarcode(barcode, catalogMap);
          onScanned?.(barcode, found);
        }
        return;
      }

      // Ignore special modifier keys
      if (e.key.length > 1) return;

      // Most barcode scanners emit keys under 40ms interval
      if (interval > 100 && scanBuffer.current.length > 0) {
        // Human typing reset
        scanBuffer.current = "";
      }

      scanBuffer.current += e.key;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [catalogMap, onScanned, disabled]);

  return null;
}
