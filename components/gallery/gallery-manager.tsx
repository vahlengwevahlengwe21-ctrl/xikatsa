'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Images, LoaderCircle, Trash2, Upload, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { databaseRequest } from '@/lib/database-api';

const MAX_PHOTOS = 100;
const PHOTOS_PER_PAGE = 12;
const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface GalleryPhoto {
  id: string;
  caption: string;
  mime_type: string;
  created_at: string;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    const end = Math.min(offset + 0x8000, bytes.length);
    const codes: number[] = [];
    for (let index = offset; index < end; index += 1) codes.push(bytes[index]);
    binary += String.fromCharCode.apply(null, codes);
  }
  return btoa(binary);
}

export function GalleryManager() {
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [founderPhotoAvailable, setFounderPhotoAvailable] = useState<boolean | null>(null);
  const [founderPhotoError, setFounderPhotoError] = useState<string | null>(null);
  const [founderFile, setFounderFile] = useState<File | null>(null);
  const [founderPhotoSaving, setFounderPhotoSaving] = useState(false);

  const loadFounderPhoto = useCallback(async () => {
    setFounderPhotoError(null);
    try {
      const response = await fetch('/api/gallery/founder', { cache: 'no-store' });
      if (response.status === 404) {
        setFounderPhotoAvailable(false);
        return;
      }
      if (!response.ok) throw new Error('The founder photo could not be loaded.');
      setFounderPhotoAvailable(true);
    } catch (reason) {
      setFounderPhotoError(reason instanceof Error ? reason.message : 'The founder photo could not be loaded.');
      setFounderPhotoAvailable(false);
    }
  }, []);

  const loadPhotos = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/gallery', { cache: 'no-store' });
      if (!response.ok) throw new Error('The gallery could not be loaded. Please try again.');
      const result = (await response.json()) as { photos?: GalleryPhoto[] };
      setPhotos(result.photos ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The gallery could not be loaded. Please try again.');
    }
  }, []);

  useEffect(() => {
    void loadPhotos();
    void loadFounderPhoto();
  }, [loadFounderPhoto, loadPhotos]);

  function chooseFiles(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    const invalidFile = chosen.find((file) => !ACCEPTED_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_FILE_SIZE);
    if (invalidFile) {
      setSelectedFiles([]);
      toast({
        title: 'Some photos could not be selected',
        description: 'Choose JPEG, PNG or WebP images no larger than 3 MB each.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedFiles(chosen);
  }

  function chooseFounderFile(file: File | null) {
    if (!file) {
      setFounderFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_FILE_SIZE) {
      setFounderFile(null);
      toast({
        title: 'Founder photo could not be selected',
        description: 'Choose a JPEG, PNG or WebP image no larger than 3 MB.',
        variant: 'destructive',
      });
      return;
    }
    setFounderFile(file);
  }

  async function saveFounderPhoto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!founderFile) return;
    setFounderPhotoSaving(true);
    try {
      await databaseRequest('gallery.founder.save', {
        mime_type: founderFile.type,
        image_base64: encodeBase64(new Uint8Array(await founderFile.arrayBuffer())),
      });
      setFounderPhotoAvailable(true);
      setFounderFile(null);
      toast({ title: 'Founder photo published', description: 'Kenny Magomani’s portrait is now shown on the public About us page.' });
    } catch (reason) {
      toast({
        title: 'Founder photo could not be published',
        description: reason instanceof Error ? reason.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setFounderPhotoSaving(false);
    }
  }

  async function removeFounderPhoto() {
    setFounderPhotoSaving(true);
    try {
      await databaseRequest('gallery.founder.delete');
      setFounderPhotoAvailable(false);
      toast({ title: 'Founder photo removed' });
    } catch (reason) {
      toast({
        title: 'Founder photo could not be removed',
        description: reason instanceof Error ? reason.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setFounderPhotoSaving(false);
    }
  }

  async function uploadPhotos(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFiles.length || !photos) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast({ title: 'Gallery is full', description: `The gallery can contain up to ${MAX_PHOTOS} photos.`, variant: 'destructive' });
      return;
    }
    if (selectedFiles.length > remaining) {
      toast({
        title: 'Too many photos selected',
        description: `There is room for ${remaining} more photo${remaining === 1 ? '' : 's'} in the gallery.`,
        variant: 'destructive',
      });
      return;
    }
    setUploading(true);
    let uploaded = 0;
    try {
      for (const file of selectedFiles) {
        await databaseRequest('gallery.add', {
          caption: caption.trim(),
          mime_type: file.type,
          image_base64: encodeBase64(new Uint8Array(await file.arrayBuffer())),
        });
        uploaded += 1;
      }
      setSelectedFiles([]);
      setCaption('');
      setPage(Math.max(0, Math.ceil((photos.length + uploaded) / PHOTOS_PER_PAGE) - 1));
      toast({
        title: uploaded === 1 ? 'Photo published' : `${uploaded} photos published`,
        description: 'The photos are now visible in the public About us slideshow.',
      });
      await loadPhotos();
    } catch (reason) {
      toast({
        title: uploaded ? `${uploaded} photo${uploaded === 1 ? '' : 's'} published` : 'Photos could not be published',
        description: reason instanceof Error ? reason.message : 'Please try again.',
        variant: 'destructive',
      });
      await loadPhotos();
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photo: GalleryPhoto) {
    setDeletingId(photo.id);
    try {
      await databaseRequest('gallery.delete', { id: photo.id });
      toast({ title: 'Photo removed from the gallery' });
      await loadPhotos();
    } catch (reason) {
      toast({
        title: 'Photo could not be removed',
        description: reason instanceof Error ? reason.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil((photos?.length ?? 0) / PHOTOS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visiblePhotos = photos?.slice(currentPage * PHOTOS_PER_PAGE, (currentPage + 1) * PHOTOS_PER_PAGE) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Society"
        title="Photo gallery"
        description="Share meeting and event photos with visitors to the Xikatsa Society website."
      />

      <section className="mb-8 rounded-2xl border border-[#dfe8df] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-[#eef2eb] sm:h-40 sm:w-32">
            {founderPhotoAvailable ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/api/gallery/founder" alt="Kenny Magomani, founder of Xikatsa Society" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-10 w-10 text-[#72917a]" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b9783f]">Founder portrait</p>
            <h2 className="mt-1 font-heading text-lg font-semibold text-[#244b3b]">Kenny Magomani</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              This photo appears alongside the Xikatsa founding story on the public About us page. Replacing it keeps just one current founder portrait.
            </p>
            {founderPhotoError && <p role="status" className="mt-2 text-sm text-rose-700">{founderPhotoError}</p>}
            <form onSubmit={saveFounderPhoto} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor="founder-photo-file" className="text-sm font-medium">{founderPhotoAvailable ? 'Replace founder photo' : 'Choose founder photo'}</label>
                <Input
                  id="founder-photo-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={founderPhotoSaving}
                  onChange={(event) => chooseFounderFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!founderFile || founderPhotoSaving} className="gap-2">
                  {founderPhotoSaving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                  {founderPhotoSaving ? 'Saving…' : founderPhotoAvailable ? 'Replace photo' : 'Publish photo'}
                </Button>
                {founderPhotoAvailable && (
                  <Button type="button" variant="outline" disabled={founderPhotoSaving} onClick={() => void removeFounderPhoto()} className="gap-2 text-rose-700 hover:bg-rose-50 hover:text-rose-800">
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Remove
                  </Button>
                )}
              </div>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">JPEG, PNG or WebP · Maximum 3 MB · Use a photo approved for the public website</p>
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <ImagePlus className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-heading text-lg font-semibold">Publish society photos</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Upload up to {MAX_PHOTOS} photos in total. JPEG, PNG and WebP files up to 3 MB each are supported.
            </p>
          </div>
        </div>

        <form onSubmit={uploadPhotos} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <label htmlFor="gallery-files" className="text-sm font-medium">Choose photos</label>
            <Input
              id="gallery-files"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={uploading || (photos?.length ?? 0) >= MAX_PHOTOS}
              onChange={(event) => chooseFiles(event.target.files)}
            />
            {selectedFiles.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedFiles.length} photo{selectedFiles.length === 1 ? '' : 's'} selected</p>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="gallery-caption" className="text-sm font-medium">Caption <span className="text-muted-foreground">(optional)</span></label>
            <Input
              id="gallery-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={180}
              placeholder="e.g. Annual members’ meeting"
              disabled={uploading}
            />
          </div>
          <Button type="submit" disabled={uploading || !selectedFiles.length || !photos || photos.length >= MAX_PHOTOS} className="gap-2">
            {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
            {uploading ? 'Uploading…' : 'Publish photos'}
          </Button>
        </form>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Published photos are visible to everyone on the public website. Please share only photos approved for public viewing.
        </p>
        {photos && (
          <p className="mt-2 text-xs font-medium text-emerald-800">{photos.length} of {MAX_PHOTOS} photos published</p>
        )}
      </section>

      <section aria-label="Published society photos">
        <div className="mb-4 flex items-center gap-2">
          <Images className="h-5 w-5 text-emerald-800" aria-hidden />
          <h2 className="font-heading text-lg font-semibold">Published photos</h2>
        </div>
        {error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}{' '}
            <button type="button" onClick={() => void loadPhotos()} className="font-medium underline underline-offset-4">Try again</button>
          </div>
        )}
        {!photos && !error && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-56 rounded-2xl" />)}</div>}
        {photos?.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <Images className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-medium">No photos published yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add the first meeting or event photos above.</p>
          </div>
        )}
        {photos && photos.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePhotos.map((photo) => (
              <article key={photo.id} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/gallery/${photo.id}`} alt={photo.caption || 'Xikatsa Society meeting or event'} className="aspect-[4/3] w-full object-cover" />
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{photo.caption || 'Society moment'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(photo.created_at).toLocaleDateString()}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${photo.caption || 'photo'}`}
                    disabled={deletingId === photo.id}
                    onClick={() => void deletePhoto(photo)}
                    className="shrink-0 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  >
                    {deletingId === photo.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
        {photos && photos.length > PHOTOS_PER_PAGE && (
          <div className="mt-5 flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="gap-1">
              <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {currentPage + 1} of {pageCount}</span>
            <Button type="button" variant="outline" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className="gap-1">
              Next <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
