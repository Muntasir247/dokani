"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Camera, RefreshCw, AlertCircle } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

export function CameraScannerModal({
  isOpen,
  onClose,
  onDetected,
}: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let isMounted = true;
    setIsInitializing(true);
    setErrorMsg(null);

    async function startCamera() {
      try {
        // 1. Try native BarcodeDetector API if available
        const hasNativeBarcodeDetector =
          typeof window !== "undefined" && "BarcodeDetector" in window;

        if (hasNativeBarcodeDetector) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });

          if (!isMounted) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }

          setIsInitializing(false);

          // Native detection loop
          // @ts-expect-error - BarcodeDetector is a modern browser web standard
          const detector = new window.BarcodeDetector({
            formats: ["ean_13", "code_128", "qr_code", "ean_8"],
          });

          const interval = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const rawVal = barcodes[0].rawValue;
                if (rawVal) {
                  clearInterval(interval);
                  onDetected(rawVal);
                  onClose();
                }
              }
            } catch {
              // Ignore single frame detection errors
            }
          }, 200);

          return () => clearInterval(interval);
        }

        // 2. Fallback to ZXing BrowserMultiFormatReader
        const codeReader = new BrowserMultiFormatReader();
        readerRef.current = codeReader;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setIsInitializing(false);

        if (!videoRef.current) return;

        codeReader.decodeFromVideoElement(videoRef.current, (result, _err) => {
          if (result) {
            const text = result.getText();
            stopCamera();
            onDetected(text);
            onClose();
          }
        });
      } catch (err: unknown) {
        if (!isMounted) return;
        setIsInitializing(false);
        const msg =
          err instanceof Error
            ? err.message
            : "Camera access denied or device not found";
        setErrorMsg(msg);
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isOpen, onDetected, onClose]);

  const stopCamera = () => {
    if (readerRef.current) {
      try {
        readerRef.current = null;
      } catch {
        // Ignore reset errors
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <Camera className="h-5 w-5 text-emerald-600" />
            <span>Camera Barcode Scanner</span>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Video Container */}
        <div className="relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          {errorMsg ? (
            <div className="p-6 text-center text-white space-y-3">
              <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
              <p className="text-sm font-medium">{errorMsg}</p>
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setIsInitializing(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/30 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry Camera
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
              />

              {/* Viewfinder Target Reticle */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-44 w-64 rounded-xl border-2 border-emerald-400/90 bg-emerald-500/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500 animate-pulse shadow-sm" />
                </div>
              </div>

              {isInitializing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                    Starting Camera...
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Info */}
        <div className="bg-slate-50 px-5 py-3 text-center text-xs text-slate-500">
          Point camera at an EAN-13 or Code128 product barcode or QR code
        </div>
      </div>
    </div>
  );
}
