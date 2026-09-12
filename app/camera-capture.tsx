"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Mic, PencilLine, RotateCcw, X, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CameraCapture({ onPhoto, onVoice, onText, onClose }: { onPhoto: (file: File) => void; onVoice: () => void; onText: () => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;
    setReady(false); setError("");
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
      } catch (e) {
        stream?.getTracks().forEach(track => track.stop());
        if (!cancelled) setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Allow camera access in your browser to scan your food." : "The live camera isn’t available here. Use your device camera or choose a photo.");
      }
    }
    void start();
    return () => { cancelled = true; stream?.getTracks().forEach(track => track.stop()); };
  }, [facing, attempt]);
  async function capture() {
    if (!ready || capturing || !video.current?.videoWidth) return;
    setCapturing(true);
    try {
      const source = video.current;
      const scale = Math.min(1, 1600 / Math.max(source.videoWidth, source.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Couldn’t capture this photo. Try choosing one from your library.");
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Couldn’t capture the photo. Please try again.")), "image/jpeg", .9));
      onPhoto(new File([blob], "Meal.jpg", { type: "image/jpeg" }));
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t take the photo."); }
    finally { setCapturing(false); }
  }
  return <div className="camera-screen">
    <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(true)} className={facing === "user" ? "selfie-camera" : ""}/>
    <div className="camera-top"><Button variant="ghost" size="icon" aria-label="Close camera" onClick={onClose}><X/></Button><span>My Diet</span><Button variant="ghost" size="icon" aria-label="Switch camera" onClick={() => setFacing(f => f === "environment" ? "user" : "environment")}><RotateCcw/></Button></div>
    {!ready && <div className="camera-fallback"><Camera size={42}/><h2>{error ? "Let’s get your meal" : "Opening camera…"}</h2><p>{error || "Allow camera access when your browser asks."}</p>{error && <><Button onClick={() => nativeInput.current?.click()}>Open device camera</Button><Button variant="ghost" onClick={() => setAttempt(n => n + 1)}>Try live camera again</Button></>}</div>}
    {ready && <div className="viewfinder" aria-hidden="true"><i/><i/><i/><i/></div>}
    <div className="camera-bottom"><p className="camera-hint">{ready ? "Fit your whole plate in the frame" : "Photo, voice, or describe your meal"}</p>
      <div className="camera-modes"><span><Camera size={20}/>Scan food</span><button onClick={onVoice}><Mic size={20}/>Voice</button><button onClick={onText}><PencilLine size={20}/>Type meal</button></div>
      <div className="shutter-row"><button aria-label="Choose photo from library" onClick={() => galleryInput.current?.click()}><ImagePlus size={26}/></button><button className="shutter" aria-label="Take food photo" disabled={capturing || (!ready && !error)} onClick={() => ready ? void capture() : nativeInput.current?.click()}>{capturing && <LoaderCircle className="animate-spin"/>}</button><span className="shutter-spacer"/></div>
    </div>
    <input hidden ref={nativeInput} type="file" accept="image/*" capture="environment" onChange={e => { if (e.target.files?.[0]) onPhoto(e.target.files[0]); e.target.value = ""; }}/>
    <input hidden ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { if (e.target.files?.[0]) onPhoto(e.target.files[0]); e.target.value = ""; }}/>
  </div>;
}
