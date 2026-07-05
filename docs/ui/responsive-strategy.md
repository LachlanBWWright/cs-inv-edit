# Responsive strategy design defence

The responsive strategy is based on **preserving task order**, not just shrinking dimensions. Inventory stays first, focused work stays second, and review telemetry stays third across every breakpoint.

Desktop uses a split layout because wide screens benefit from parallel visibility: browse on the left, confirm on the right. Mobile uses stacked cards and a bottom jump nav because narrow screens benefit from short vertical segments and clear thumb targets.

Spacing, border radius, and contrast are intentionally generous. That makes the interface feel more app-like inside both Electron and Capacitor wrappers, which is important when a single SolidJS surface must serve web, desktop, and mobile contexts.
