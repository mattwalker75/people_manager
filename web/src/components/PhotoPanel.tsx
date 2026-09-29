/**
 * Photos on the person card: the main photo large, then one slot per allowed
 * photo. "+" picks a file, you crop it square, and it is uploaded; click a
 * photo to make it the main one, open it, or delete it.
 */
import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ChevronLeft, ChevronRight, Eye, ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorText } from "../lib/api";
import { photoUrl } from "../lib/format";
import { useRefresh, type PersonFull } from "../lib/hooks";
import { useConfirm } from "./confirm";
import { Avatar, Button, cx, IconButton, Menu, Modal } from "./ui";

/** Draw the chosen square onto a canvas and return a JPEG (at most 1000 × 1000). */
async function cropToJpeg(src: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const size = Math.min(1000, Math.round(area.width));
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("The photo could not be prepared."))), "image/jpeg", 0.9));
}

function CropDialog({ file, onClose, onDone }: { file: File | null; onClose: () => void; onDone: (blob: Blob, name: string) => Promise<void> }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const src = file ? URL.createObjectURL(file) : "";
  return (
    <Modal open={!!file} onOpenChange={(v) => !v && onClose()} title="Crop the photo" description="Drag to position, scroll or use the slider to zoom. Photos are saved square." className="w-[min(620px,94vw)]">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
        <div className="relative h-[380px] overflow-hidden rounded-2xl bg-[#101614]">
          {src && <Cropper image={src} crop={crop} zoom={zoom} aspect={1} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_a, px) => setArea(px)} />}
        </div>
        <label className="flex items-center gap-3 text-[13px] text-mute">Zoom
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" aria-label="Zoom" />
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!area} onClick={async () => {
            if (!file || !area) return; setBusy(true);
            try { const base = file.name.replace(/\.[^.]+$/, "") || "photo"; await onDone(await cropToJpeg(src, area), `${base}.jpg`); onClose(); }
            catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
          }}>Save photo</Button>
        </div>
      </div>
    </Modal>
  );
}

/** A photo shown large in a floating window, with ‹ › (and the arrow keys) to step through the others. */
function PhotoViewer({ person, index, onClose, onIndex }: { person: PersonFull; index: number | null; onClose: () => void; onIndex: (i: number) => void }) {
  const photos = person.photos;
  const ph = index === null ? null : photos[index];
  const step = (by: number) => { if (index !== null && photos.length > 1) onIndex((index + by + photos.length) % photos.length); };
  useEffect(() => {
    if (index === null) return;
    const f = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }); // re-bound each render so `step` sees the current photo
  return (
    <Modal open={!!ph} onOpenChange={(v) => !v && onClose()} title={`${person.firstName} ${person.lastName}`.trim()}
      description={ph ? `Photo ${index! + 1} of ${photos.length}${ph.id === person.mainPhotoId ? " · main photo" : ""}` : undefined} className="w-[min(860px,94vw)]">
      {ph && (
        <div className="flex flex-col gap-3 px-6 pb-6 pt-4">
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-surface-2">
            <img src={photoUrl(person.id, ph.filename)} alt={`${person.firstName}, photo ${index! + 1}`} className="max-h-[70vh] w-auto max-w-full object-contain" />
            {photos.length > 1 && <>
              <IconButton label="Previous photo" onClick={() => step(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 bg-surface/90 shadow-soft"><ChevronLeft size={20} /></IconButton>
              <IconButton label="Next photo" onClick={() => step(1)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-surface/90 shadow-soft"><ChevronRight size={20} /></IconButton>
            </>}
          </div>
          <div className="text-center font-mono text-[12px] text-faint">{ph.filename}</div>
        </div>
      )}
    </Modal>
  );
}

export function PhotoPanel({ person, max }: { person: PersonFull; max: number }) {
  const refresh = useRefresh();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const main = person.photos.find((p) => p.id === person.mainPhotoId) ?? null;
  const call = async (fn: () => Promise<unknown>, done?: string) => { try { await fn(); await refresh(); if (done) toast(done); } catch (e) { toast.error(errorText(e)); } };
  const upload = async (blob: Blob, name: string) => {
    const fd = new FormData(); fd.append("photo", blob, name);
    await api.post(`/api/people/${person.id}/photos`, fd);
    await refresh(); toast("Photo added.");
  };
  const slots = Array.from({ length: Math.max(max, person.photos.length) }, (_, i) => person.photos[i] ?? null);

  return (
    <div className="flex flex-col gap-3">
      {main ? (
        <button type="button" aria-label="View the main photo" title="View" onClick={() => setViewing(person.photos.findIndex((p) => p.id === main.id))} className="overflow-hidden rounded-[18px]">
          <img src={photoUrl(person.id, main.filename)} alt={`${person.firstName}'s main photo`} className="aspect-square w-full object-cover transition hover:scale-[1.02]" />
        </button>
      )
        : <Avatar person={person} size={256} rounded="rounded-[18px]" className="!h-auto aspect-square !w-full font-display !text-[72px]" />}
      <div className="grid grid-cols-5 gap-1.5">
        {slots.slice(0, Math.max(5, slots.length)).map((ph, i) => ph ? (
          <Menu key={ph.id} align="start" trigger={
            <button type="button" aria-label={`Photo ${i + 1}${ph.id === person.mainPhotoId ? " (main)" : ""}`}
              className={cx("aspect-square overflow-hidden rounded-[10px]", ph.id === person.mainPhotoId && "ring-2 ring-accent ring-offset-2 ring-offset-surface-2")}>
              <img src={photoUrl(person.id, ph.filename)} alt="" className="h-full w-full object-cover" />
            </button>}
            items={[
              { label: "View photo", icon: <Eye size={14} />, onSelect: () => setViewing(i) },
              { label: "Make main photo", icon: <Star size={14} />, disabled: ph.id === person.mainPhotoId, onSelect: () => call(() => api.post(`/api/people/${person.id}/photos/${ph.id}/main`), "Main photo changed.") },
              "sep",
              { label: "Delete photo…", icon: <Trash2 size={14} />, danger: true, onSelect: async () => {
                if (await confirm({ title: "Delete this photo?", message: "The file is removed from the photos folder.", confirmLabel: "Delete photo", danger: true }))
                  await call(() => api.del(`/api/people/${person.id}/photos/${ph.id}`), "Photo deleted.");
              } },
            ]} />
        ) : i < max ? (
          <button key={`empty-${i}`} type="button" aria-label="Add a photo" onClick={() => input.current?.click()} disabled={person.photos.length >= max}
            className={cx("flex aspect-square items-center justify-center rounded-[10px] border-[1.5px] border-dashed text-mute",
              i === person.photos.length ? "border-line-2 hover:border-accent hover:text-accent" : "border-line opacity-50")}>
            {i === person.photos.length && <ImagePlus size={16} />}
          </button>
        ) : null)}
      </div>
      <div className="text-[12px] leading-snug text-mute">
        {person.photos.length} of {max} photos.{person.photos.length ? " The ringed one is the main photo — it shows on their card. Click the big photo to view it; click a small one for options." : " Add one to see who this is at a glance."}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
      <CropDialog file={file} onClose={() => setFile(null)} onDone={upload} />
      <PhotoViewer person={person} index={viewing !== null && viewing < person.photos.length ? viewing : null} onClose={() => setViewing(null)} onIndex={setViewing} />
    </div>
  );
}
