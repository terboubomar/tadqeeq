# Fix the blank-screen React context crash

## Changes
- Align the TanStack Start, Router, and Router Plugin packages to one compatible release.
- Reinstall dependencies and clear only Vite’s generated dependency cache.
- Restart the preview once so it rebuilds a single React/router bundle.

## Verification
- Open `/auth` in a fresh browser session.
- Confirm the page renders without `useContext`, console, or page errors.
- Check the latest preview build status.

## Technical detail
The app currently mixes `@tanstack/react-router` 1.170.18, `@tanstack/react-start` 1.168.32, and `@tanstack/router-plugin` 1.168.23. These packages share router context internals and must be kept on the same compatible version.
