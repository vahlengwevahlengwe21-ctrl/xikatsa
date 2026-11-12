'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  HeartHandshake,
  Landmark,
  MessageCircle,
  Pause,
  Play,
  Scale,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS, type CommitteeOfficeRole } from '@/lib/auth';

const navigation = [
  { id: 'about', label: 'About us' },
  { id: 'mission', label: 'Our mission' },
  { id: 'values', label: 'Our values' },
] as const;

type LandingView = (typeof navigation)[number]['id'] | 'home';

interface GalleryPhoto {
  id: string;
  caption: string;
  mime_type: string;
  created_at: string;
}

interface CommitteeProfile {
  role_key: CommitteeOfficeRole;
  full_name: string;
  bio: string;
  has_photo: boolean | number;
}

const values = [
  {
    title: 'Togetherness',
    description: 'We look out for one another and share responsibility for our community.',
    icon: HeartHandshake,
  },
  {
    title: 'Integrity',
    description: 'We act honestly and handle society responsibilities with care.',
    icon: ShieldCheck,
  },
  {
    title: 'Dignity',
    description: 'We listen, show respect and support members without judgement.',
    icon: Sparkles,
  },
  {
    title: 'Stewardship',
    description: 'We make thoughtful decisions and treat shared resources responsibly.',
    icon: Scale,
  },
  {
    title: 'Belonging',
    description: 'We make space for members to be heard, included and connected.',
    icon: UsersRound,
  },
];

export function LandingPage({ onLogin }: { onLogin: () => void }) {
  const [activeView, setActiveView] = useState<LandingView>('home');
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [isSlideshowPaused, setIsSlideshowPaused] = useState(false);
  const [founderPhotoAvailable, setFounderPhotoAvailable] = useState(false);
  const [committeeProfiles, setCommitteeProfiles] = useState<CommitteeProfile[] | null>(null);
  const [committeeProfileError, setCommitteeProfileError] = useState<string | null>(null);

  function navigateTo(view: LandingView) {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (activeView !== 'about') return;

    let cancelled = false;
    fetch('/api/gallery', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Society photos are temporarily unavailable.');
        return (await response.json()) as { photos?: GalleryPhoto[] };
      })
      .then((result) => {
        if (!cancelled) {
          setPhotos(result.photos ?? []);
          setPhotoError(null);
          setActivePhoto(0);
        }
      })
      .catch(() => {
        if (!cancelled) setPhotoError('Society photos are temporarily unavailable.');
      });

    return () => {
      cancelled = true;
    };
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'about') return;

    let cancelled = false;
    fetch('/api/committee', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Committee profiles are temporarily unavailable.');
        return (await response.json()) as { profiles?: CommitteeProfile[] };
      })
      .then((result) => {
        if (!cancelled) {
          setCommitteeProfiles(result.profiles ?? []);
          setCommitteeProfileError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setCommitteeProfileError('Committee profiles are temporarily unavailable.');
      });

    return () => {
      cancelled = true;
    };
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'about') return;

    let cancelled = false;
    fetch('/api/gallery/founder', { cache: 'no-store' })
      .then((response) => {
        if (!cancelled) setFounderPhotoAvailable(response.ok);
      })
      .catch(() => {
        if (!cancelled) setFounderPhotoAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'about' || isSlideshowPaused || !photos || photos.length < 2) return;
    const timer = window.setInterval(() => {
      setActivePhoto((index) => (index + 1) % photos.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeView, isSlideshowPaused, photos]);

  function movePhoto(direction: -1 | 1) {
    if (!photos?.length) return;
    setActivePhoto((index) => (index + direction + photos.length) % photos.length);
  }

  return (
    <main className="min-h-screen bg-[#faf9f5] text-[#183b32]">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-y-4 px-5 py-5 sm:px-8 lg:px-12">
        <button
          type="button"
          onClick={() => navigateTo('home')}
          className="flex items-center gap-3 text-left"
          aria-label="Xikatsa Society home"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#17483b] text-white shadow-lg shadow-emerald-950/10">
            <Landmark className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block font-heading text-sm font-extrabold tracking-[0.12em]">XIKATSA</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-[#6b8176]">Society</span>
          </span>
        </button>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          {navigation.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigateTo(id)}
              aria-current={activeView === id ? 'page' : undefined}
              className={`border-b-2 py-2 text-sm font-medium transition-colors ${
                activeView === id
                  ? 'border-[#b9783f] text-[#17483b]'
                  : 'border-transparent text-[#52675d] hover:text-[#17483b]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <Button
          type="button"
          onClick={onLogin}
          className="h-10 rounded-full bg-[#17483b] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#10392f]"
        >
          Member sign in <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
        </Button>

        <nav className="flex w-full items-center justify-between gap-3 border-t border-[#e7e9df] pt-3 md:hidden" aria-label="Page sections">
          {navigation.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigateTo(id)}
              aria-current={activeView === id ? 'page' : undefined}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                activeView === id
                  ? 'bg-[#17483b] text-white'
                  : 'text-[#52675d] hover:bg-[#e9f0e7]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-10 pt-5 sm:px-8 sm:pb-14 lg:px-12 lg:pt-8">
        {activeView === 'home' && (
          <section className="grid items-center gap-10 lg:min-h-[590px] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div className="relative z-[1]">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce6d9] bg-white/80 px-3.5 py-2 text-xs font-semibold tracking-wide text-[#416551] shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#cf8d4a]" />
                A community that shows up
              </div>
              <h1 className="max-w-3xl font-heading text-[2.8rem] font-semibold leading-[1.08] tracking-[-0.055em] text-[#173c32] sm:text-6xl lg:text-[4.35rem]">
                When we stand
                <br className="hidden sm:block" /> together, <span className="font-serif italic font-medium text-[#b9783f]">we grow</span>
                <br className="hidden sm:block" /> stronger.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#607269] sm:text-lg sm:leading-8">
                Xikatsa Society brings people together through mutual care, shared responsibility and support when it matters most.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={onLogin}
                  className="h-12 rounded-full bg-[#17483b] px-7 text-sm font-semibold text-white shadow-lg shadow-[#17483b]/15 hover:bg-[#10392f]"
                >
                  Enter member portal <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigateTo('about')}
                  className="h-12 rounded-full border-[#d8e1d7] bg-white/70 px-7 text-sm font-semibold text-[#345847] hover:bg-white"
                >
                  Discover Xikatsa <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="mt-8 flex items-center gap-3 text-xs font-medium text-[#74847b]">
                <span className="flex -space-x-2" aria-hidden>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#faf9f5] bg-[#dce8d9] text-[#416551]"><UsersRound className="h-3.5 w-3.5" /></span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#faf9f5] bg-[#f0dfc8] text-[#9a673c]"><HeartHandshake className="h-3.5 w-3.5" /></span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#faf9f5] bg-[#d8e5e0] text-[#416551]"><Check className="h-3.5 w-3.5" /></span>
                </span>
                <span>Rooted in community. Guided by care.</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[520px] lg:ml-auto">
              <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#e8d4b8]/50 blur-3xl" aria-hidden />
              <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-[#cbded0]/70 blur-3xl" aria-hidden />
              <div className="relative overflow-hidden rounded-[2rem] bg-[#17483b] p-5 shadow-[0_30px_90px_-35px_rgba(23,60,50,0.5)] sm:p-7">
                <div className="absolute inset-0 opacity-[0.12]" aria-hidden style={{ backgroundImage: 'radial-gradient(#fff 0.7px, transparent 0.7px)', backgroundSize: '15px 15px' }} />
                <div className="relative flex items-center justify-between text-white/75">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.24em]">Our shared promise</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10"><Sparkles className="h-4 w-4" aria-hidden /></span>
                </div>
                <div className="relative mt-5 rounded-[1.5rem] bg-[#f7f5eb] p-6 sm:p-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#8b765d]">A stronger community</p>
                  <p className="mt-3 max-w-xs font-heading text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#193e33] sm:text-4xl">
                    Care is something we build, together.
                  </p>
                  <div className="my-6 h-px bg-[#dfe3d8]" />
                  <div className="space-y-3">
                    {['Members supporting members', 'Open and responsible stewardship', 'A community with room for everyone'].map((item) => (
                      <div key={item} className="flex items-center gap-3 text-sm font-medium text-[#52675d]">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dce9dc] text-[#39704d]"><Check className="h-3.5 w-3.5" aria-hidden /></span>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative mt-4 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                  <span>United in purpose</span>
                  <span>Xikatsa Society</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === 'about' && (
          <section aria-labelledby="about-title" className="mx-auto max-w-5xl py-8 sm:py-12">
            <button type="button" onClick={() => navigateTo('home')} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607269] transition-colors hover:text-[#17483b]">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
            </button>
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
              <div className="space-y-5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b9783f]">About us</p>
                <h1 id="about-title" className="mt-4 font-heading text-4xl font-semibold leading-tight tracking-[-0.04em] text-[#173c32] sm:text-5xl">
                  From friendship to a shared promise.
                </h1>
                <div className="flex items-center gap-4 rounded-2xl border border-[#e5e8dc] bg-white/80 p-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#e9f0e7] text-[#64836d]">
                    {founderPhotoAvailable ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/api/gallery/founder" alt="Kenny Magomani, founder of Xikatsa Society" className="h-full w-full object-cover" />
                    ) : (
                      <UsersRound className="h-8 w-8" aria-hidden />
                    )}
                  </div>
                  <div>
                    <p className="font-heading text-base font-semibold text-[#244b3b]">Kenny Magomani</p>
                    <p className="mt-1 text-sm text-[#718078]">Founder of Xikatsa Society</p>
                  </div>
                </div>
                <p className="text-base leading-7 text-[#607269] sm:text-lg sm:leading-8">
                  Xikatsa began with founder Kenny Magomani and a close-knit group of friends. They spent time together, shared a drink and stood by one another. But when someone was injured or became ill, they could find themselves without the money needed to get medical care. If a friend died, the group could struggle to afford a dignified burial.
                </p>
                <p className="text-base leading-7 text-[#607269] sm:text-lg sm:leading-8">
                  Kenny saw that friendship alone could not meet those urgent needs. The group needed a way to prepare, contribute and support one another when life took a difficult turn. From that need came Xikatsa: a society founded on mutual help and the belief that no one should have to face hardship alone.
                </p>
                <div className="rounded-2xl border border-[#e5e8dc] bg-white/80 p-5">
                  <p className="text-sm leading-6 text-[#607269]">
                    What began as an idea among friends has grown into a community of members who share that same vision: to care for one another through illness, injury, loss and life’s other challenges.
                  </p>
                  <p className="mt-3 border-t border-[#e8ebe3] pt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#315944]">
                    Founded by Kenny Magomani · Built on a shared vision
                  </p>
                </div>
              </div>
              <section aria-label="Xikatsa Society meeting and event photos" className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b9783f]">Life at Xikatsa</p>
                    <h2 className="mt-1 font-heading text-lg font-semibold text-[#244b3b]">Meetings &amp; moments</h2>
                  </div>
                  {photos && photos.length > 0 && (
                    <span className="shrink-0 rounded-full bg-[#e9f0e7] px-3 py-1.5 text-xs font-semibold text-[#3c6a4c]">
                      {activePhoto + 1} / {photos.length}
                    </span>
                  )}
                </div>
                <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-[#e4e8df] bg-[#e9eee7] shadow-sm sm:aspect-[16/10]">
                  {photos && photos.length > 0 && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        key={photos[activePhoto].id}
                        src={`/api/gallery/${photos[activePhoto].id}`}
                        alt={photos[activePhoto].caption || 'Xikatsa Society meeting or event'}
                        className="absolute inset-0 h-full w-full animate-in fade-in duration-700 object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-5 pb-5 pt-16">
                        <p aria-live="polite" className="text-sm font-medium text-white drop-shadow">
                          {photos[activePhoto].caption || 'A moment shared at Xikatsa Society'}
                        </p>
                      </div>
                      {photos.length > 1 && (
                        <>
                          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-3">
                          <button
                            type="button"
                            onClick={() => movePhoto(-1)}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#17483b] shadow transition-colors hover:bg-white"
                            aria-label="Previous society photo"
                          >
                            <ChevronLeft className="h-5 w-5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePhoto(1)}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#17483b] shadow transition-colors hover:bg-white"
                            aria-label="Next society photo"
                          >
                            <ChevronRight className="h-5 w-5" aria-hidden />
                          </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsSlideshowPaused((paused) => !paused)}
                            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#17483b] shadow transition-colors hover:bg-white"
                            aria-label={isSlideshowPaused ? 'Resume photo slideshow' : 'Pause photo slideshow'}
                          >
                            {isSlideshowPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {!photos && !photoError && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-[#607269]">Loading society photos…</div>
                  )}
                  {photoError && (
                    <div role="status" className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[#607269]">{photoError}</div>
                  )}
                  {photos?.length === 0 && !photoError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                      <UsersRound className="h-8 w-8 text-[#72917a]" aria-hidden />
                      <p className="mt-3 font-medium text-[#315944]">Our community, together</p>
                      <p className="mt-1 text-sm text-[#718078]">Meeting and event photos will be shared here.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <section aria-labelledby="committee-title" className="mt-12">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b9783f]">Our committee</p>
                <h2 id="committee-title" className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] text-[#173c32] sm:text-4xl">
                  People entrusted to serve.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#718078]">
                  Meet the office-holders helping guide Xikatsa Society and care for our shared community.
                </p>
              </div>
              {committeeProfileError && (
                <p role="status" className="mt-6 text-center text-sm text-[#718078]">{committeeProfileError}</p>
              )}
              {committeeProfiles && committeeProfiles.length === 0 && !committeeProfileError && (
                <p className="mt-6 text-center text-sm text-[#718078]">Committee profiles will appear here.</p>
              )}
              {committeeProfiles && committeeProfiles.length > 0 && (
                <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {committeeProfiles.map((profile) => (
                    <article key={`${profile.role_key}-${profile.full_name}`} className="overflow-hidden rounded-2xl border border-[#e4e8df] bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#e9f0e7] text-[#64836d]">
                          {Boolean(Number(profile.has_photo)) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/committee/${profile.role_key}/photo`}
                              alt={`${profile.full_name}, ${ROLE_LABELS[profile.role_key]}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <UsersRound className="h-7 w-7" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-heading text-base font-semibold text-[#244b3b]">{profile.full_name}</h3>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#b9783f]">
                            {ROLE_LABELS[profile.role_key]}
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 min-h-10 text-sm leading-5 text-[#718078]">
                        {profile.bio || `Serving Xikatsa Society as ${ROLE_LABELS[profile.role_key]}.`}
                      </p>
                    </article>
                  ))}
                </div>
              )}
              {!committeeProfiles && !committeeProfileError && (
                <p className="mt-6 text-center text-sm text-[#718078]">Loading committee profiles…</p>
              )}
            </section>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { title: 'A shared community', text: 'Members come together with a common purpose and a commitment to one another.' },
                { title: 'Support that matters', text: 'We work to make mutual care dependable, respectful and rooted in real needs.' },
                { title: 'Responsible by design', text: 'We value thoughtful stewardship, clear communication and accountability.' },
              ].map(({ title, text }) => (
                <article key={title} className="rounded-2xl border border-[#e4e8df] bg-white p-5 sm:p-6">
                  <h2 className="font-heading text-base font-semibold text-[#244b3b]">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#718078]">{text}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === 'mission' && (
          <section aria-labelledby="mission-title" className="mx-auto max-w-5xl py-8 sm:py-12">
            <button type="button" onClick={() => navigateTo('home')} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607269] transition-colors hover:text-[#17483b]">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
            </button>
            <div className="relative overflow-hidden rounded-[2rem] bg-[#17483b] px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-14">
              <div className="absolute -right-16 -top-28 h-80 w-80 rounded-full border border-white/10" aria-hidden />
              <div className="absolute -right-4 -top-16 h-64 w-64 rounded-full border border-white/10" aria-hidden />
              <div className="relative max-w-3xl">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[#e7c39a]">
                  <Landmark className="h-6 w-6" aria-hidden />
                </span>
                <p className="mt-7 text-xs font-bold uppercase tracking-[0.22em] text-[#e7c39a]">Our mission</p>
                <h1 id="mission-title" className="mt-3 font-heading text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">
                  To build a caring, resilient community where members can rely on one another.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-emerald-50/75">
                  We put our mission into practice by listening to members, bringing people together and managing shared responsibilities with care.
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { title: 'Listen', text: 'Understand member needs with empathy and respect.', icon: MessageCircle },
                { title: 'Support', text: 'Build a culture where members can show up for one another.', icon: HeartHandshake },
                { title: 'Steward', text: 'Act thoughtfully and communicate with accountability.', icon: Eye },
              ].map(({ title, text, icon: Icon }) => (
                <article key={title} className="flex gap-4 rounded-2xl border border-[#e4e8df] bg-white p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e9f0e7] text-[#3c6a4c]"><Icon className="h-5 w-5" aria-hidden /></span>
                  <div>
                    <h2 className="font-heading text-base font-semibold text-[#244b3b]">{title}</h2>
                    <p className="mt-1 text-sm leading-5 text-[#718078]">{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === 'values' && (
          <section aria-labelledby="values-title" className="mx-auto max-w-5xl py-8 sm:py-12">
            <button type="button" onClick={() => navigateTo('home')} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607269] transition-colors hover:text-[#17483b]">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
            </button>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b9783f]">Our values</p>
                <h1 id="values-title" className="mt-3 font-heading text-4xl font-semibold tracking-[-0.04em] text-[#173c32] sm:text-5xl">
                  The way we show up.
                </h1>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#718078]">
                The principles behind every decision, every act of support and every connection we make.
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {values.map(({ title, description, icon: Icon }) => (
                <article key={title} className="flex gap-4 rounded-2xl border border-[#e4e8df] bg-white p-5 transition-colors hover:border-[#c6d6c6] sm:p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f0e7] text-[#3c6a4c]"><Icon className="h-5 w-5" aria-hidden /></span>
                  <div>
                    <h2 className="font-heading text-base font-semibold text-[#244b3b]">{title}</h2>
                    <p className="mt-1.5 text-sm leading-5 text-[#718078]">{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-8 flex flex-col gap-3 border-t border-[#e7e9df] pt-5 text-xs text-[#718078] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold tracking-[0.12em] text-[#355744]">XIKATSA SOCIETY</span>
          <span>Built on care. Sustained by community.</span>
        </footer>
      </div>
    </main>
  );
}
