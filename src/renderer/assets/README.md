# Logo & icon assets

| File / folder | Purpose |
|---------------|--------|
| **logo.png** | App logo used in the UI: sidebar (MainWindow), Settings → About. Import in code: `import appLogo from '../assets/logo.png'`. |
| **../public/favicon.png** | Window favicon (copy of logo). Served at `/favicon.png` and linked from `index.html`. |

App and tray icons (built/packaged) live in the repo root:

| Location | Purpose |
|----------|--------|
| **build/icon.png** | Main app icon (dock, taskbar, installers). Referenced in `electron-builder.yml` and `src/main/windows.ts`, `src/main/index.ts`. |
| **build/icon.icns**, **build/icons/** | Platform-specific icon sets generated from `icon.png` for macOS/Linux. |
| **resources/tray-icon.png**, **tray-icon@2x.png** | System tray icons (1x and 2x). Used in `src/main/index.ts`. |

To update branding: replace `logo.png` here, then run `cp src/renderer/assets/logo.png src/renderer/public/favicon.png` if you want the window favicon to match. For the app icon and tray, update `build/icon.png` and `resources/tray-icon*.png` and rebuild.
