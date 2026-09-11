"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Paperclip, Send, Square, X, LoaderCircle, Plus, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { emptyMeal, type Meal } from "@/lib/meals";
import { api, jsonBody } from "@/lib/client";

type Estimate = { status: "ready" | "needs_details" | "not_food"; title: string; portion: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null; notes: string; question: string; confidence: string };
export default function Composer({ date, aiReady, onReview, resetKey, initialPhoto, voiceFirst = false }: { date: string; aiReady: boolean | null; onReview: (meal: Meal) => void; resetKey: number; initialPhoto?: File | null; voiceFirst?: boolean }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [dragging, setDragging] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null), audioInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const initialStarted = useRef(false);
  const locked = Boolean(busy) || recording;

  useEffect(() => { setText(""); setPhoto(null); setAudio(null); setQuestion(""); setError(""); }, [resetKey]);
  useEffect(() => {
    if (initialStarted.current || aiReady === null) return;
    initialStarted.current = true;
    if (initialPhoto) void uploadPhoto(initialPhoto, true);
    else if (voiceFirst) void startRecording();
  }, [initialPhoto, voiceFirst, aiReady]);
  useEffect(() => {
    if (!audio) { setAudioUrl(""); return; }
    const url = URL.createObjectURL(audio); setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (recordTimer.current) clearTimeout(recordTimer.current); if (recorder.current?.state === "recording") recorder.current.stop(); streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  const report = (e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");

  async function uploadPhoto(file: File, autoReview = false) {
    if (locked) return; setBusy("Preparing photo…"); setError(""); setQuestion("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPG, PNG or WebP photo. Convert HEIC photos to JPG first.");
      if (file.size > 20 * 1024 * 1024) throw new Error("Choose a photo smaller than 20 MB.");
      const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Couldn’t read this photo. Please choose another."); });
      let blob: Blob;
      try {
        const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Photo processing isn’t supported in this browser.");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Couldn’t prepare the photo.")), "image/jpeg", 0.87));
      } finally { bitmap.close(); }
      if (blob.size > 4 * 1024 * 1024) throw new Error("This photo is too large after processing. Try a smaller image.");
      setBusy("Saving photo…");
      const savedPhoto = await api<{ key: string; url: string }>("/api/photos", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      setPhoto(savedPhoto);
      if (autoReview && aiReady) await estimatePhoto(savedPhoto.key);
      else if (autoReview && aiReady === false) setQuestion("Photo saved. Enter your calories below; AI estimates will be available once your key is connected.");
    } catch (e) { report(e); } finally { setBusy(""); if (photoInput.current) photoInput.current.value = ""; }
  }
  function chooseAudio(file: File) {
    setError("");
    if (file.size > 10 * 1024 * 1024) { setError("Voice notes must be 10 MB or smaller."); return; }
    if (!file.size) { setError("That voice note is empty."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const known: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", wav: "audio/wav", webm: "audio/webm" };
    if (!known[extension]) { setError("Choose an MP3, M4A, MP4, WAV, or WebM voice note."); return; }
    setAudio(new File([file], file.name, { type: known[extension] })); setQuestion("");
  }
  async function startRecording() {
    setError(""); setSeconds(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Recording isn’t available here. Upload a voice note instead.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream;
      if (!mounted.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(t => MediaRecorder.isTypeSupported(t));
      if (!type) { stream.getTracks().forEach(t => t.stop()); throw new Error("This browser’s recording format isn’t supported. Upload a voice note instead."); }
      const rec = new MediaRecorder(stream, { mimeType: type }); recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onerror = () => { if (rec.state === "recording") rec.stop(); if (mounted.current) setError("Recording failed. Please try again or upload audio."); };
      rec.onstop = () => {
        if (recordTimer.current) clearTimeout(recordTimer.current);
        stream.getTracks().forEach(t => t.stop());
        if (!mounted.current) return;
        setRecording(false);
        const extension = type.includes("mp4") ? "m4a" : "webm";
        chooseAudio(new File(chunks, "Voice note." + extension, { type: type.split(";")[0] }));
      };
      rec.start(); setRecording(true);
      recordTimer.current = setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 120_000);
    } catch (e) { streamRef.current?.getTracks().forEach(t => t.stop()); report(e); }
  }
  async function transcribe() {
    if (!audio || !aiReady) return; setBusy("Transcribing voice note…"); setError("");
    try {
      const data = await api<{ text: string }>("/api/transcribe", { method: "POST", headers: { "Content-Type": audio.type }, body: audio });
      setText(previous => (previous ? previous + "\n" : "") + data.text);
      setAudio(null); setQuestion("Transcript added. Check the words, then estimate your meal.");
    } catch (e) { report(e); } finally { setBusy(""); }
  }
  async function estimate() {
    if (!aiReady || locked) return; setBusy("Estimating your meal…"); setError(""); setQuestion("");
    await estimatePhoto(photo?.key ?? null);
  }
  async function estimatePhoto(imageKey: string | null) {
    setBusy("Estimating your meal…"); setError(""); setQuestion("");
    try {
      const { estimate } = await api<{ estimate: Estimate }>("/api/estimate", jsonBody({ text, imageKey }));
      if (estimate.status !== "ready" || estimate.calories === null) { setQuestion(estimate.question || "Please add more meal and portion details."); return; }
      if (mounted.current) onReview({ ...emptyMeal(date), title: estimate.title, portion: estimate.portion, calories: estimate.calories, protein: estimate.protein, carbs: estimate.carbs, fat: estimate.fat, notes: "Confidence: " + estimate.confidence + ". " + estimate.notes, imageKey, source: "ai" });
    } catch (e) { report(e); } finally { setBusy(""); }
  }
  return <aside className="composer-panel">
    <p className="eyebrow">MY DIET</p><h2>{initialPhoto ? "Your meal" : "What did you eat?"}</h2><p className="muted">{initialPhoto ? "Add any portions, oils, or sauces." : "Say it or type it. Include portions if you can."}</p>
    <div className={"meal-composer " + (dragging ? "dragging" : "")} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) void uploadPhoto(e.dataTransfer.files[0]); }}>
      {photo && <div className="attached-photo"><img src={photo.url} alt="Attached meal photo" /><Button size="icon" variant="secondary" aria-label="Detach photo" disabled={locked} onClick={() => setPhoto(null)}><X /></Button></div>}
      <Textarea aria-label="Describe your meal" value={text} maxLength={4000} disabled={locked} placeholder={"e.g. Two eggs, a slice of toast,\nand coffee with milk…"} onChange={e => setText(e.target.value)} onPaste={e => { const file = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"))?.getAsFile(); if (file) { e.preventDefault(); void uploadPhoto(file); } }} rows={4} />
      <div className="composer-tools">
        <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => photoInput.current?.click()}><Camera /> Photo</Button>
        <Button type="button" variant={recording ? "destructive" : "ghost"} size="sm" disabled={Boolean(busy)} onClick={() => recording ? recorder.current?.stop() : void startRecording()}>{recording ? <Square /> : <Mic />}{recording ? seconds + "s · Stop" : "Record"}</Button>
        <Button variant="ghost" size="icon" aria-label="Upload audio" disabled={locked} onClick={() => audioInput.current?.click()}><Paperclip /></Button>
      </div>
    </div>
    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" ref={photoInput} aria-label="Choose meal photo" onChange={e => { if (e.target.files?.[0]) void uploadPhoto(e.target.files[0]); }} />
    <input className="sr-only" type="file" accept=".mp3,.m4a,.mp4,.wav,.webm" ref={audioInput} aria-label="Choose voice note" onChange={e => { if (e.target.files?.[0]) chooseAudio(e.target.files[0]); e.target.value = ""; }} />
    {recording && <p className="recording-label" role="status">Recording… up to 2 minutes.</p>}
    {audio && <div className="audio-attachment"><div><span><AudioLines size={16} /> Voice note</span><Button size="icon" variant="ghost" aria-label="Remove voice note" disabled={locked} onClick={() => setAudio(null)}><X /></Button></div><audio src={audioUrl} controls /><Button size="sm" variant="outline" disabled={!aiReady || locked} onClick={() => void transcribe()}>Transcribe to text</Button></div>}
    {error && <p className="composer-error" role="alert">{error}</p>}
    {question && <p className="question-note" role="status">{question}</p>}
    <Button className="estimate-button w-full" disabled={!aiReady || locked || (!text.trim() && !photo) || !date} onClick={() => void estimate()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}{busy || "Estimate meal"}</Button>
    {aiReady === false ? <p className="connection-note"><strong>API key pending.</strong> Save meals manually now; connect your key later for AI.</p> : aiReady === null ? <p className="connection-note">Checking AI connection…</p> : <p className="connection-note">You review every estimate before it’s logged.</p>}
    <Button variant="ghost" className="w-full" disabled={locked || !date} onClick={() => onReview({ ...emptyMeal(date), title: text.slice(0, 160), notes: text, imageKey: photo?.key ?? null })}><Plus /> Enter calories manually</Button>
    <div className="photo-tip"><img src="/meal-photo-tip.png" alt="Example of a meal photographed from above with all portions visible" width={76} height={76} /><div><strong>For a better estimate</strong><p>Show the whole plate. Add amounts and any oils or sauces.</p><small>Example photo</small></div></div>
  </aside>;
}
