import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadUrlForPlatform,
  fetchLatestVersion,
  isNewerVersion,
  parseVersionTag,
} from "./updateCheck";

const MAC_ELECTRON_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Klausurdashboard/1.0.0 Chrome/128.0.0.0 Electron/42.5.0 Safari/537.36";
const WIN_ELECTRON_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Klausurdashboard/1.0.0 Chrome/128.0.0.0 Electron/42.5.0 Safari/537.36";
const MAC_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

describe("parseVersionTag", () => {
  it("parses a tag with v prefix", () => {
    expect(parseVersionTag("v1.2.3")).toEqual([1, 2, 3]);
  });

  it("parses a bare semver string", () => {
    expect(parseVersionTag("10.0.42")).toEqual([10, 0, 42]);
  });

  it.each(["", "v1.2", "1.2.3.4", "v1.2.3-beta", "latest", "v1.a.3"])(
    "rejects invalid tag %j",
    (tag) => {
      expect(parseVersionTag(tag)).toBeNull();
    },
  );
});

describe("isNewerVersion", () => {
  it.each([
    ["1.0.1", "1.0.0"],
    ["1.1.0", "1.0.9"],
    ["2.0.0", "1.9.9"],
    ["1.10.0", "1.9.0"],
  ])("treats %s as newer than %s", (latest, current) => {
    expect(isNewerVersion(latest, current)).toBe(true);
  });

  it.each([
    ["1.0.0", "1.0.0"],
    ["0.9.9", "1.0.0"],
    ["1.0.0", "1.0.1"],
  ])("treats %s as not newer than %s", (latest, current) => {
    expect(isNewerVersion(latest, current)).toBe(false);
  });

  it("returns false when either version is unparseable", () => {
    expect(isNewerVersion("not-a-version", "1.0.0")).toBe(false);
  });
});

describe("downloadUrlForPlatform", () => {
  it("links the dmg for the macOS Electron app", () => {
    expect(downloadUrlForPlatform(MAC_ELECTRON_UA)).toBe(
      "https://github.com/hackerFlo/Klausurdashboard/releases/latest/download/Klausurdashboard-macOS.dmg",
    );
  });

  it("links the setup exe for the Windows Electron app", () => {
    expect(downloadUrlForPlatform(WIN_ELECTRON_UA)).toBe(
      "https://github.com/hackerFlo/Klausurdashboard/releases/latest/download/Klausurdashboard-Setup-Windows.exe",
    );
  });

  it("links the landing page for plain browsers", () => {
    expect(downloadUrlForPlatform(MAC_BROWSER_UA)).toBe(
      "https://hackerflo.github.io/Klausurdashboard/",
    );
  });
});

describe("fetchLatestVersion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetchResponse = (body: unknown, ok = true) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }),
    );
  };

  it("returns the normalized version from a valid release response", async () => {
    stubFetchResponse({ tag_name: "v1.2.3" });
    await expect(fetchLatestVersion()).resolves.toBe("1.2.3");
  });

  it("returns null on a non-ok HTTP response", async () => {
    stubFetchResponse({ tag_name: "v1.2.3" }, false);
    await expect(fetchLatestVersion()).resolves.toBeNull();
  });

  it("returns null when the tag is missing or malformed", async () => {
    stubFetchResponse({ tag_name: "nightly" });
    await expect(fetchLatestVersion()).resolves.toBeNull();
  });

  it("returns null when fetch rejects (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchLatestVersion()).resolves.toBeNull();
  });
});
