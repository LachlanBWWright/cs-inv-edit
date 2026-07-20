import { type JSX } from 'solid-js';
import { AppDashboardMain } from './AppDashboardMain.js';
import { AppDashboardSide } from './AppDashboardSide.js';
import type { AppDashboardProps, Notice } from './AppDashboardTypes.js';

export type { AppDashboardProps, Notice } from './AppDashboardTypes.js';

const iconButton = 'rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium tracking-[0.24em] text-slate-200 transition hover:border-sky-300/50 hover:bg-sky-400/10';

function HeaderNav(props: { platformFocus: string | undefined }): JSX.Element {
  return (
    <header class="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.32em] text-sky-200">CS inventory edit</p>
          <h1 class="mt-2 text-2xl font-semibold text-white sm:text-3xl">Responsive operations cockpit</h1>
          <p class="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">{props.platformFocus ?? 'Loading cross-platform review shell…'}</p>
        </div>
        <div class="hidden items-center gap-2 md:flex">
          <a class={iconButton} href="#inventory">Inventory</a>
          <a class={iconButton} href="#workbench">Workbench</a>
          <a class={iconButton} href="#activity">Activity</a>
          <button class={iconButton} onClick={() => window.open('https://solidjs.com', '_blank', 'noopener,noreferrer')} type="button">SolidJS</button>
        </div>
      </div>
    </header>
  );
}

function MobileNav(): JSX.Element {
  return (
    <nav class="fixed inset-x-4 bottom-4 z-30 rounded-full border border-white/10 bg-slate-950/90 p-2 shadow-2xl shadow-sky-950/30 backdrop-blur md:hidden">
      <div class="grid grid-cols-3 gap-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
        <a class="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-100" href="#inventory">Inventory</a>
        <a class="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-100" href="#workbench">Workbench</a>
        <a class="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-100" href="#activity">Activity</a>
      </div>
    </nav>
  );
}

export function AppDashboard(props: AppDashboardProps): JSX.Element {
  return (
    <div class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_48%,_#020617_100%)] text-slate-100">
      <HeaderNav platformFocus={props.dashboard?.platformFocus} />
      <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div class="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
          <AppDashboardMain {...props} />
          <AppDashboardSide {...props} />
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
