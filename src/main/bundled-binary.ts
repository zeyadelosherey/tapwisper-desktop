import { app } from 'electron'
import path from 'path'

/**
 * Absolute path of a helper shipped in resources/bin. When packaged, resources
 * are unpacked next to app.asar (see asarUnpack in electron-builder.yml) so
 * they can be executed.
 */
export function bundledBinaryPath(...segments: string[]): string {
  const relative = path.join('resources', 'bin', ...segments)
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', relative)
    : path.join(app.getAppPath(), relative)
}
