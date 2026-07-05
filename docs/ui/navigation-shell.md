# Navigation shell design defence

The shell keeps navigation deliberately lightweight: a compact desktop link row and a mobile bottom nav with just three anchors. This avoids turning the app into a route-heavy experience when the user mainly needs fast movement between inventory, workbench, and activity.

The sticky header preserves context on long pages and makes the platform shell explicit. The user can immediately see whether they are reviewing the shared web experience or the Electron-wrapped desktop shell.

The bottom navigation is justified on mobile because the inventory screen is visually dense. Keeping the jump targets fixed near the thumb zone reduces scrolling fatigue and helps the mobile wrapper feel app-native rather than like a cramped desktop page.
