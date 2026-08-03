/**
 * ScannerService — the ONLY barcode service of Vytelis Supply.
 * Supports USB/Bluetooth keyboard-wedge scanners and the device camera.
 */

export type ScanHandler = (code: string) => void;

interface WedgeOptions {
  /** Max ms between keystrokes to be considered a scanner burst. */
  maxKeyIntervalMs?: number;
  /** Minimum length of a valid code. */
  minLength?: number;
}

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true;
}

export const ScannerService = {
  /**
   * Global keyboard-wedge capture: works even when no field is focused.
   * Returns a detach function.
   */
  attachKeyboardWedge(onScan: ScanHandler, options: WedgeOptions = {}): () => void {
    if (typeof window === "undefined") return () => {};
    const maxInterval = options.maxKeyIntervalMs ?? 45;
    const minLength = options.minLength ?? 4;
    let buffer = "";
    let last = 0;

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return; // the focused field handles it
      const now = Date.now();
      if (now - last > maxInterval) buffer = "";
      last = now;
      if (e.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (code.length >= minLength) {
          e.preventDefault();
          onScan(code);
        }
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  },

  /** Normalises a scanned/typed code. */
  normalize(raw: string): string {
    return raw.replace(/\s+/g, "").trim();
  },

  isCameraSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "BarcodeDetector" in window &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia
    );
  },

  /**
   * Starts the device camera and reports the first stable detection.
   * Returns a stop() function; always call it when closing the UI.
   */
  async startCamera(video: HTMLVideoElement, onScan: ScanHandler): Promise<() => void> {
    if (!ScannerService.isCameraSupported()) {
      throw new Error(
        "Leitura por câmera não suportada neste navegador. Use um leitor USB ou digite o código.",
      );
    }
    const DetectorCtor = (
      window as unknown as {
        BarcodeDetector: new (opts?: { formats?: string[] }) => {
          detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;

    const detector = new DetectorCtor({
      formats: ["ean_13", "ean_8", "code_128", "code_39", "itf", "upc_a", "upc_e", "qr_code"],
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play();

    let running = true;
    const loop = async () => {
      if (!running) return;
      try {
        const found = await detector.detect(video);
        const code = found[0]?.rawValue;
        if (code) {
          onScan(ScannerService.normalize(code));
          stop();
          return;
        }
      } catch {
        /* frame not ready — keep scanning */
      }
      if (running) requestAnimationFrame(() => void loop());
    };

    function stop() {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }

    void loop();
    return stop;
  },
};
