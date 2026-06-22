import type { DashboardData } from './types'

export const dashboardFixture: DashboardData = {
  sessionStartedAt: '2026-06-22T13:39:58Z',
  platformFocus: 'Placeholder-safe UI review across web, Electron, and Capacitor shells.',
  highlightedCollections: ['Anubis', 'Kilowatt', 'Overpass 2024', 'Mirage 2025'],
  recommendedTradeUpIds: ['itm-001', 'itm-002', 'itm-003', 'itm-004', 'itm-005', 'itm-006', 'itm-007', 'itm-008', 'itm-009', 'itm-010'],
  inventory: [
    { id: 'itm-001', name: 'M4A1-S', finish: 'Nitro Signal', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Minimal Wear', wearValue: 0.09, statTrak: false, stickers: 3, inStorage: false, priceBand: '$24-$36', readiness: 'Ready', accent: 'from-amber-400/60 to-orange-500/30' },
    { id: 'itm-002', name: 'USP-S', finish: 'Temple Drift', weapon: 'Pistol', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Factory New', wearValue: 0.02, statTrak: false, stickers: 4, inStorage: false, priceBand: '$18-$24', readiness: 'Ready', accent: 'from-cyan-400/60 to-sky-500/30' },
    { id: 'itm-003', name: 'AK-47', finish: 'Scarab Coil', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Field-Tested', wearValue: 0.17, statTrak: true, stickers: 2, inStorage: false, priceBand: '$31-$42', readiness: 'Review', accent: 'from-emerald-400/60 to-green-500/30' },
    { id: 'itm-004', name: 'MAC-10', finish: 'Dune Rhythm', weapon: 'SMG', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Minimal Wear', wearValue: 0.08, statTrak: false, stickers: 1, inStorage: false, priceBand: '$8-$12', readiness: 'Ready', accent: 'from-fuchsia-400/60 to-violet-500/30' },
    { id: 'itm-005', name: 'AUG', finish: 'Sun Vault', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Field-Tested', wearValue: 0.15, statTrak: false, stickers: 2, inStorage: false, priceBand: '$11-$16', readiness: 'Ready', accent: 'from-yellow-300/60 to-amber-500/30' },
    { id: 'itm-006', name: 'P250', finish: 'Civic Sand', weapon: 'Pistol', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Minimal Wear', wearValue: 0.07, statTrak: false, stickers: 0, inStorage: false, priceBand: '$4-$7', readiness: 'Ready', accent: 'from-indigo-400/60 to-blue-500/30' },
    { id: 'itm-007', name: 'Galil AR', finish: 'Pharaoh Circuit', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Factory New', wearValue: 0.03, statTrak: false, stickers: 2, inStorage: false, priceBand: '$9-$13', readiness: 'Ready', accent: 'from-orange-300/60 to-rose-500/30' },
    { id: 'itm-008', name: 'MP9', finish: 'Glyph Sprint', weapon: 'SMG', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Factory New', wearValue: 0.01, statTrak: false, stickers: 1, inStorage: false, priceBand: '$6-$10', readiness: 'Ready', accent: 'from-teal-300/60 to-cyan-500/30' },
    { id: 'itm-009', name: 'Five-SeveN', finish: 'Copper Delta', weapon: 'Pistol', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Minimal Wear', wearValue: 0.05, statTrak: false, stickers: 2, inStorage: false, priceBand: '$7-$11', readiness: 'Ready', accent: 'from-lime-300/60 to-green-500/30' },
    { id: 'itm-010', name: 'FAMAS', finish: 'Canal Mesh', weapon: 'Rifle', collection: 'Anubis', rarity: 'Mil-Spec', wearLabel: 'Field-Tested', wearValue: 0.19, statTrak: false, stickers: 1, inStorage: false, priceBand: '$10-$15', readiness: 'Review', accent: 'from-slate-300/60 to-slate-500/30' },
    { id: 'itm-011', name: 'M4A4', finish: 'Lantern Pulse', weapon: 'Rifle', collection: 'Kilowatt', rarity: 'Restricted', wearLabel: 'Minimal Wear', wearValue: 0.10, statTrak: true, stickers: 4, inStorage: false, priceBand: '$58-$73', readiness: 'Ready', accent: 'from-violet-300/60 to-purple-500/30' },
    { id: 'itm-012', name: 'AWP', finish: 'Parcel Shade', weapon: 'Sniper', collection: 'Mirage 2025', rarity: 'Classified', wearLabel: 'Factory New', wearValue: 0.01, statTrak: false, stickers: 4, inStorage: true, storageUnitId: 'sto-002', priceBand: '$104-$128', readiness: 'Blocked', accent: 'from-blue-300/60 to-indigo-500/30' }
  ],
  storageUnits: [
    { id: 'sto-001', name: 'Operations Queue', zone: 'Trade-up staging', capacity: 80, occupied: 62, theme: 'Ready for rapid churn' },
    { id: 'sto-002', name: 'Premium Showcase', zone: 'High-value preservation', capacity: 50, occupied: 48, theme: 'Tight capacity for premium items' },
    { id: 'sto-003', name: 'Sticker Lab Overflow', zone: 'Temporary sticker variants', capacity: 40, occupied: 18, theme: 'Ample room for experiments' }
  ],
  activity: [
    { id: 'act-001', title: 'GC session model reviewed', detail: 'UI copy flags the unofficial and policy-sensitive nature of write actions.', status: 'Completed', timestamp: '2m ago' },
    { id: 'act-002', title: 'Trade-up basket staged', detail: 'Ten Anubis Mil-Spec items are prepared for placeholder probability review.', status: 'Queued', timestamp: '6m ago' },
    { id: 'act-003', title: 'Storage capacity warning', detail: 'Premium Showcase is nearly full, so move plans surface a caution state.', status: 'Review', timestamp: '9m ago' },
    { id: 'act-004', title: 'Responsive shell pass', detail: 'Desktop sidebar collapses into a mobile bottom nav with preserved jump links.', status: 'Completed', timestamp: '14m ago' }
  ],
  statusFlags: [
    { label: 'Identity posture', value: 'Steam sign-in only', tone: 'Stable' },
    { label: 'Mutation posture', value: 'Manual review required', tone: 'Risk' },
    { label: 'GC readiness', value: 'Hello version tracked', tone: 'Watch' },
    { label: 'Mock data safety', value: 'No live credentials', tone: 'Stable' }
  ],
  complianceNotes: [
    { title: 'No live credentials', detail: 'All flows are designed with placeholders so the UI can be validated without accessing real inventory data.' },
    { title: 'Human-led operations', detail: 'Every destructive pathway is framed as a reviewed plan, not an automatic mutation.' },
    { title: 'Protocol drift aware', detail: 'Health cards and activity rails expose stale-session risk so the UI reflects the researched technical constraints.' }
  ],
}
