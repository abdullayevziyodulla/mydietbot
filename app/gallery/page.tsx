"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

type GalleryImage = {
  key: string;
  name: string;
  size: number;
  uploaded: string;
  url: string;
};

type AddImageInput = {
  name: string;
  contentType: string;
  base64: string;
};

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

function readAddImageInput(value: unknown): AddImageInput {
  if (!value || typeof value !== "object") throw new Error("Image data is required.");
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("A file name is required.");
  if (typeof input.contentType !== "string" || !input.contentType.startsWith("image/")) {
    throw new Error("contentType must be an image MIME type.");
  }
  if (typeof input.base64 !== "string" || !input.base64) throw new Error("Base64 image data is required.");
  if (input.base64.length > 14_000_000) throw new Error("Images must be 10 MB or smaller.");
  return input as AddImageInput;
}

export default function Home() {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadImages = useCallback(async () => {
    const response = await fetch("/api/images", { cache: "no-store" });
    if (!response.ok) throw new Error("Couldn’t load your gallery.");
    const data = (await response.json()) as { images: GalleryImage[] };
    setImages(data.images);
  }, []);

  useEffect(() => {
    loadImages()
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Couldn’t load your gallery."))
      .finally(() => setLoading(false));
  }, [loadImages]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const valid = files.filter((file) => ACCEPTED_IMAGE_TYPES.includes(file.type));
      if (!valid.length) throw new Error("Choose a JPG, PNG, WebP, GIF, or AVIF image.");
      setUploading(true);
      setError("");

      try {
        for (let index = 0; index < valid.length; index += 1) {
          setStatus(`Adding ${index + 1} of ${valid.length}…`);
          const formData = new FormData();
          formData.set("image", valid[index]);
          const response = await fetch("/api/images", { method: "POST", body: formData });
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `Couldn’t add ${valid[index].name}.`);
          }
        }
        await loadImages();
        setStatus(`${valid.length} image${valid.length === 1 ? "" : "s"} added`);
      } finally {
        setUploading(false);
      }
    },
    [loadImages],
  );

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "add_gallery_image",
            title: "Add image to gallery",
            description: "Add one base64-encoded image to the visible personal gallery and refresh the collection.",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", description: "File name including an image extension." },
                contentType: { type: "string", description: "Image MIME type, such as image/png." },
                base64: { type: "string", description: "Raw base64-encoded image bytes without a data URL prefix." },
              },
              required: ["name", "contentType", "base64"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            async execute(rawInput) {
              const input = readAddImageInput(rawInput);
              const blob = await (await fetch(`data:${input.contentType};base64,${input.base64}`)).blob();
              await uploadFiles([new File([blob], input.name, { type: input.contentType })]);
              return { added: true, name: input.name, imageCount: images.length + 1 };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => undefined);
    } catch {
      // WebMCP is optional and may not be available in every browser.
    }

    return () => lifecycle.abort();
  }, [images.length, uploadFiles]);

  async function handleFiles(files: FileList | File[]) {
    try {
      await uploadFiles(Array.from(files));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t add those images.");
      setStatus("");
    } finally {
      if (pickerRef.current) pickerRef.current.value = "";
    }
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1500px] px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <ImagePlus className="size-5" aria-hidden="true" />
            </span>
            <a href="/" className="text-base font-semibold tracking-tight">My Diet</a><span className="text-sm text-muted-foreground">/ Image gallery</span>
          </div>

          <input
            ref={pickerRef}
            className="sr-only"
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            multiple
            aria-label="Choose images"
            onChange={(event) => event.target.files && void handleFiles(event.target.files)}
          />
          <Button
            className="h-11 rounded-full px-5"
            disabled={uploading}
            onClick={() => pickerRef.current?.click()}
          >
            {uploading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
            {uploading ? "Adding…" : "Add images"}
          </Button>
        </header>

        <section className="grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(220px,0.55fr)_1.45fr] lg:gap-16">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              Personal collection
            </p>
            <h1 className="max-w-xl font-serif text-5xl leading-[0.95] tracking-[-0.045em] sm:text-7xl lg:text-8xl">
              Images, all in one place.
            </h1>
            <div className="mt-6 min-h-6 text-sm" aria-live="polite">
              {error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">{status}</p>}
            </div>
          </div>

          <div>
            {loading ? (
              <div className="grid min-h-[420px] place-items-center rounded-[2rem] border border-border bg-card">
                <LoaderCircle className="size-7 animate-spin text-primary" aria-label="Loading gallery" />
              </div>
            ) : images.length ? (
              <div className="columns-1 gap-4 sm:columns-2 xl:columns-3" aria-label="Image gallery">
                {images.map((image, index) => (
                  <a
                    key={image.key}
                    href={image.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group mb-4 block break-inside-avoid overflow-hidden rounded-[1.35rem] bg-card shadow-[0_16px_50px_rgba(20,20,22,0.08)] outline-none ring-primary transition hover:-translate-y-0.5 focus-visible:ring-4"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.name}
                      className="h-auto w-full bg-muted object-cover transition duration-500 group-hover:scale-[1.015]"
                      loading={index < 4 ? "eager" : "lazy"}
                    />
                    <span className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                      <ImageIcon className="size-4" aria-hidden="true" />
                      <span className="truncate">{image.name}</span>
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-[420px] w-full items-center justify-center rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center shadow-[0_24px_80px_rgba(20,20,22,0.05)] outline-none transition hover:border-primary hover:bg-secondary/30 focus-visible:ring-4 focus-visible:ring-ring"
                onClick={() => pickerRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleFiles(event.dataTransfer.files);
                }}
              >
                <span className="max-w-sm">
                  <span className="mx-auto mb-6 grid size-16 place-items-center rounded-2xl bg-secondary text-primary">
                    <UploadCloud className="size-7" aria-hidden="true" />
                  </span>
                  <span className="block text-2xl font-semibold tracking-tight">Add your first images</span>
                  <span className="mt-2 block text-base leading-7 text-muted-foreground">
                    Choose images or drop them here. They’ll stay in your collection between visits.
                  </span>
                </span>
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
