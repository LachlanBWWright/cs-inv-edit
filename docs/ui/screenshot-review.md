# Screenshot review

## Captures

- Desktop review capture: `docs/ui/screenshots/dashboard-desktop.png` at `1440×1600`
- Mobile review capture: `docs/ui/screenshots/dashboard-mobile.png` at `430×1400`

## Review notes

The desktop capture confirms that the layout behaves like an operations workspace rather than a marketing landing page. The hero, inventory grid, workbench, and right-rail review surfaces remain visible in one pass without collapsing into clutter.

The mobile capture confirms that the same screen order still works when stacked vertically. The dense inventory cards remain readable, action buttons stay comfortably tappable, and the bottom jump navigation keeps the key sections reachable without excessive scrolling.

The screenshots also validate the colour hierarchy. Bright item gradients draw attention to the item cards, while status and compliance surfaces remain visually distinct without overpowering the primary workflow.

## Platform interpretation

The Electron desktop shell intentionally reuses the desktop capture because it wraps the same SolidJS surface in a dedicated native window with tighter chrome and desktop-friendly minimum sizing.

The Capacitor shell intentionally reuses the mobile capture because the Android wrapper is expected to present the same responsive mobile surface inside a native web view.
