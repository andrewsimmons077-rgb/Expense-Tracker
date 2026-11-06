/**
 * Where the Windows desktop app is published. Keep in sync with build.publish in desktop/package.json,
 * which is where the installer is uploaded by `npm run release`.
 */
export const DESKTOP_RELEASES = { owner: 'YOUR_GITHUB_USERNAME', repo: 'expense-tracker' };

/** False until the GitHub repository above has been filled in. */
export const desktopDownloadsConfigured = DESKTOP_RELEASES.owner !== 'YOUR_GITHUB_USERNAME';

export const releasesPageUrl = `https://github.com/${DESKTOP_RELEASES.owner}/${DESKTOP_RELEASES.repo}/releases/latest`;

/** True when this page is running inside the desktop app itself. */
export const isDesktopApp = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');

export const isWindows = () =>
  typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);

export interface DesktopRelease {
  version: string;
  url: string;
  size: number;
  publishedAt: string;
}

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

/**
 * Looks up the newest published installer. Uses fetch rather than HttpClient so the sign-in token
 * is never sent to GitHub. Returns null when there's no release with an installer yet.
 */
export async function fetchLatestRelease(signal: AbortSignal): Promise<DesktopRelease | null> {
  if (!desktopDownloadsConfigured) return null;
  const res = await fetch(
    `https://api.github.com/repos/${DESKTOP_RELEASES.owner}/${DESKTOP_RELEASES.repo}/releases/latest`,
    { signal, headers: { Accept: 'application/vnd.github+json' } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const release = (await res.json()) as GitHubRelease;
  const exes = release.assets.filter((a) => /\.exe$/i.test(a.name));
  // Prefer the 64-bit setup file if a release ever carries several.
  const installer =
    exes.find((a) => /setup/i.test(a.name) && !/ia32|arm64/i.test(a.name)) ??
    exes.find((a) => /setup/i.test(a.name)) ??
    exes[0];
  if (!installer) return null;
  return {
    version: release.tag_name.replace(/^v/, ''),
    url: installer.browser_download_url,
    size: installer.size,
    publishedAt: release.published_at,
  };
}
