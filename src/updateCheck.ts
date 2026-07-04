const RELEASES_LATEST_API =
  "https://api.github.com/repos/hackerFlo/Klausurdashboard/releases/latest";
const RELEASES_LATEST_DOWNLOAD =
  "https://github.com/hackerFlo/Klausurdashboard/releases/latest/download";
const LANDING_PAGE_URL = "https://hackerflo.github.io/Klausurdashboard/";
const FETCH_TIMEOUT_MS = 5000;

const VERSION_TAG_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function parseVersionTag(tag: string): [number, number, number] | null {
  const match = VERSION_TAG_PATTERN.exec(tag);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersionTag(latest);
  const currentParts = parseVersionTag(current);
  if (!latestParts || !currentParts) return false;
  for (let i = 0; i < 3; i++) {
    if (latestParts[i] !== currentParts[i]) return latestParts[i] > currentParts[i];
  }
  return false;
}

// The GitHub API response is external input: only the strictly validated
// tag_name ever leaves this function, everything else is discarded (C-4).
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(RELEASES_LATEST_API, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const tag =
      typeof body === "object" && body !== null && "tag_name" in body
        ? (body as { tag_name: unknown }).tag_name
        : null;
    if (typeof tag !== "string" || !parseVersionTag(tag)) return null;
    return tag.replace(/^v/, "");
  } catch (error) {
    // Offline, timeout, or rate-limited — the update notice is best-effort
    // and must never surface an error or block the app.
    console.debug("Update check skipped:", error);
    return null;
  }
}

export function downloadUrlForPlatform(userAgent: string): string {
  if (userAgent.includes("Electron")) {
    if (userAgent.includes("Macintosh")) {
      return `${RELEASES_LATEST_DOWNLOAD}/Klausurdashboard-macOS.dmg`;
    }
    if (userAgent.includes("Windows")) {
      return `${RELEASES_LATEST_DOWNLOAD}/Klausurdashboard-Setup-Windows.exe`;
    }
  }
  return LANDING_PAGE_URL;
}
