import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Camera based barcode / QR scanner with a keyboard fallback.
 *
 * Works with hand-held USB/bluetooth scanners too: those emulate a keyboard, so
 * the manual field (auto-focused) captures the code and submits on Enter.
 */
export function CodeScannerDialog({
  onScan,
  trigger,
  title = "Scan code",
  description = "Point the camera at a plate, offcut or job barcode / QR code.",
}: {
  onScan: (code: string) => void;
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <ScanLine className="mr-2 h-4 w-4" /> Scan
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && (
          <ScannerBody
            onScan={(code) => {
              setOpen(false);
              onScan(code);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ScannerBody({
  onScan,
  className,
}: {
  onScan: (code: string) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => controlsRef.current?.stop(), []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      if (!videoRef.current) return;
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) {
            const text = result.getText().trim();
            controls.stop();
            controlsRef.current = null;
            setCameraOn(false);
            onScan(text);
          }
        },
      );
      controlsRef.current = controls;
      setCameraOn(true);
    } catch {
      setError(
        "Camera unavailable. Grant camera permission or type / scan the code with a hand-held reader below.",
      );
      setCameraOn(false);
    }
  }, [onScan]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative overflow-hidden rounded-lg border bg-muted/40">
        <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
        {!cameraOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <Camera className="h-6 w-6 text-muted-foreground" />
            <Button size="sm" onClick={() => void start()}>
              Start camera
            </Button>
          </div>
        )}
        {cameraOn && (
          <div className="pointer-events-none absolute inset-6 rounded-md border-2 border-primary/70" />
        )}
      </div>

      {cameraOn && (
        <Button variant="outline" size="sm" onClick={stop} className="w-full">
          <CameraOff className="mr-2 h-4 w-4" /> Stop camera
        </Button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = manual.trim();
          if (!code) return;
          setManual("");
          stop();
          onScan(code);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Keyboard className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-8 font-mono"
            placeholder="PLT-000123 / OFC-000045 / JOB-00007"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
        </div>
        <Button type="submit">Find</Button>
      </form>
    </div>
  );
}
