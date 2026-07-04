/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Send, Play, Square, Pause, Layers } from "lucide-react";
import bannerWhiteImg from "./assets/banner-white.png";
import wcIconImg from "./assets/wc-icon.png";
import { downloadUrlForPlatform, fetchLatestVersion, isNewerVersion } from "./updateCheck";

const LEHRSTUHL_DEFAULT = "Lehrstuhl für Öffentliches Recht und Staatsphilosophie";

function BannerBox({ text }: { text: string }) {
  return (
    <div className="banner-wrap">
      <img src={bannerWhiteImg} className="header-img" alt="LMU Header" />
      <div className="banner-text-box">
        <span className="banner-text">{text || LEHRSTUHL_DEFAULT}</span>
      </div>
    </div>
  );
}

type AbgabeMode = "off" | "auto" | "now";
const MIN_STAPEL = 2;
const MAX_STAPEL = 5;
const CONTROL_HEIGHT = 46; // px — canonical control height; keep in sync with --control-height in index.css
const DEFAULT_STAPEL: string[] = ["A-G", "H-O", "P-Z"];
const ABGABE_BUFFER_MS = 2500; // grace period (ms) after time runs out before auto-showing

function clampStapel(arr: unknown): string[] {
  const a = Array.isArray(arr) ? arr.map((x) => String(x ?? "")) : [...DEFAULT_STAPEL];
  if (a.length < MIN_STAPEL) return [...a, ...DEFAULT_STAPEL].slice(0, MIN_STAPEL);
  return a.slice(0, MAX_STAPEL);
}
// any is justified: reads raw localStorage / BroadcastChannel data of unknown shape
function parseStapel(d: any): string[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (Array.isArray(d?.stapel)) return clampStapel(d.stapel);
  if (d?.s1 || d?.s2 || d?.s3) return [d.s1 ?? "A-G", d.s2 ?? "H-O", d.s3 ?? "P-Z"];
  return [...DEFAULT_STAPEL];
}
function parseAbgabeMode(d: any): AbgabeMode { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (d?.abgabeMode === "off" || d?.abgabeMode === "auto" || d?.abgabeMode === "now") return d.abgabeMode;
  return d?.autoAbgabe ? "auto" : "off";
}
function stapelLabel(index: number, count: number): string {
  if (count === 2) return ["Stapel Links", "Stapel Rechts"][index];
  if (count === 3) return ["Stapel Links", "Stapel Mitte", "Stapel Rechts"][index];
  return `Stapel ${index + 1}`;
}
function arrowAngle(index: number, count: number): number {
  if (count <= 1) return 0;
  return 45 - (90 * index) / (count - 1); // N=3 → +45,0,−45 (identical to original)
}

interface ExamData {
  name: string;
  duration: number;
  abgabeMode: AbgabeMode;
  stapel: string[];
  wcOccupied: boolean;
  isPaused: boolean;
  remainingTimeMs: number;
  announcement?: string;
  lehrstuhlText?: string;
}

export default function App() {
  const [isBeamerView, setIsBeamerView] = useState(false);

  useEffect(() => {
    // Check if URL has ?beamer query param
    const checkView = () => {
      setIsBeamerView(window.location.search.includes("beamer"));
    };
    checkView();
    // Listen to popstate or location changes (e.g., if we modify in-app)
    window.addEventListener("popstate", checkView);
    return () => window.removeEventListener("popstate", checkView);
  }, []);

  useEffect(() => {
    document.title = isBeamerView ? "Anzeige" : "Klausurdashboard";
  }, [isBeamerView]);

  // Keep screen awake using the Screen Wake Lock API
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch (err) {
        console.warn("Screen Wake Lock request failed:", err);
      }
    };

    // Attempt initial wake lock
    requestWakeLock();

    // Re-request wake lock if tab is switched/returned to visible status
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        await requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Keep active or re-request on typical user gestures to fully cover inactivity threshold
    const handleActivity = () => {
      if (!wakeLock) {
        requestWakeLock();
      }
    };

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("mousedown", handleActivity, { passive: true });
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      if (wakeLock) {
        try {
          wakeLock.release().catch(() => {});
        } catch (e) {}
      }
    };
  }, []);

  if (isBeamerView) {
    return <BeamerView />;
  }

  return <AdminView />;
}

/* ==========================================
   ADMIN DASHBOARD VIEW
   ========================================== */
function AdminView() {
  // Sync state with localStorage
  const [examName, setExamName] = useState("VÜ ÖffR");
  const [duration, setDuration] = useState(90);
  const [durationRaw, setDurationRaw] = useState("90");
  const [abgabeMode, setAbgabeMode] = useState<AbgabeMode>("off");
  // tracks only "off"/"auto" so the toggle buttons don't change appearance when abgabeMode="now"
  const [baseAbgabeMode, setBaseAbgabeMode] = useState<"off" | "auto">("off");
  const [stapel, setStapel] = useState<string[]>([...DEFAULT_STAPEL]);

  const [wcOccupied, setWcOccupied] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [remainingTimeMs, setRemainingTimeMs] = useState(0);

  const [examActive, setExamActive] = useState(false);
  const [examEnd, setExamEnd] = useState(0);
  const [examTotalMs, setExamTotalMs] = useState(0);
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [isAbgabeModalOpen, setIsAbgabeModalOpen] = useState(false);

  const [announcement, setAnnouncement] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [lehrstuhlText, setLehrstuhlText] = useState(LEHRSTUHL_DEFAULT);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const beamerWindowsRef = useRef<Window[]>([]);
  const latestStateRef = useRef<any>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const announcementInputRef = useRef<HTMLTextAreaElement>(null);

  // Keep latestStateRef updated on every single render
  latestStateRef.current = {
    examName,
    duration,
    abgabeMode,
    stapel,
    wcOccupied,
    isPaused,
    remainingTimeMs,
    announcement,
    lehrstuhlText,
    examActive,
    examEnd,
    examTotalMs,
  };

  // Set up the persistent BroadcastChannel and message listener on mount
  useEffect(() => {
    try {
      const bc = new BroadcastChannel("lmu_klausur_channel");
      broadcastChannelRef.current = bc;
      bc.onmessage = (event) => {
        if (event.data && event.data.type === "REQUEST_SYNC") {
          bc.postMessage({ type: "SYNC_STATE", payload: latestStateRef.current });
        }
      };
    } catch (e) {
      console.warn("Failed to initialize BroadcastChannel in AdminView:", e);
    }

    const handleSyncRequest = (event: MessageEvent) => {
      if (event.data && event.data.type === "REQUEST_SYNC") {
        if (event.source) {
          const srcWin = event.source as Window;
          if (srcWin && srcWin !== iframeRef.current?.contentWindow && !beamerWindowsRef.current.includes(srcWin)) {
            beamerWindowsRef.current.push(srcWin);
          }
          (event.source as any).postMessage({ type: "SYNC_STATE", payload: latestStateRef.current }, "*");
        }
      }
    };
    window.addEventListener("message", handleSyncRequest);

    return () => {
      window.removeEventListener("message", handleSyncRequest);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, []);

  // Periodically clean up closed beamer windows
  useEffect(() => {
    const interval = setInterval(() => {
      beamerWindowsRef.current = beamerWindowsRef.current.filter((win) => !win.closed);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Best-effort update notice: checked once per app start; offline the fetch
  // resolves to null and nothing renders — the app never depends on it.
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchLatestVersion().then((latest) => {
      if (!cancelled && latest && isNewerVersion(latest, __APP_VERSION__)) {
        setUpdateVersion(latest);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize and load from local storage
  useEffect(() => {
    // Re-stamp the Beamer footer timer on every fresh app session, otherwise the
    // timestamp from a previous run is already >2.5min old and the footer hides instantly.
    localStorage.setItem("beamer_footer_shown_at", String(Date.now()));

    const rawData = localStorage.getItem("examData");
    if (rawData) {
      try {
        const data: ExamData = JSON.parse(rawData);
        setExamName(data.name || "VÜ ÖffR");
        const loadedDuration = data.duration || 90;
        setDuration(loadedDuration);
        setDurationRaw(String(loadedDuration));
        const parsedMode = parseAbgabeMode(data);
        setAbgabeMode(parsedMode);
        setBaseAbgabeMode(parsedMode === "now" ? "auto" : parsedMode);
        setStapel(parseStapel(data));
        setWcOccupied(data.wcOccupied ?? false);
        setIsPaused(data.isPaused ?? false);
        setRemainingTimeMs(data.remainingTimeMs ?? 0);
        setAnnouncement(data.announcement || "");
        setAnnouncementDraft(data.announcement || "");
        setLehrstuhlText(data.lehrstuhlText || LEHRSTUHL_DEFAULT);
      } catch (e) {
        console.error("Error reading examData from localStorage:", e);
      }
    }

    const activeStr = localStorage.getItem("exam_active");
    setExamActive(activeStr === "true");

    const endStr = localStorage.getItem("exam_end");
    if (endStr) setExamEnd(parseInt(endStr, 10));

    const totalStr = localStorage.getItem("exam_total_ms");
    if (totalStr) setExamTotalMs(parseInt(totalStr, 10));

    setIsLoaded(true);
  }, []);

  // Broadcast and persist updates of state whenever ANY state changes
  useEffect(() => {
    if (!isLoaded) return;

    const payload = {
      examName,
      duration,
      abgabeMode,
      stapel,
      wcOccupied,
      isPaused,
      remainingTimeMs,
      announcement,
      lehrstuhlText,
      examActive,
      examEnd,
      examTotalMs,
    };

    // 1. Persist to localStorage
    const baseData: ExamData = {
      name: examName,
      duration,
      abgabeMode,
      stapel,
      wcOccupied,
      isPaused,
      remainingTimeMs,
      announcement,
      lehrstuhlText,
    };
    
    localStorage.setItem("examData", JSON.stringify(baseData));
    localStorage.setItem("exam_active", examActive ? "true" : "false");
    localStorage.setItem("exam_end", String(examEnd));
    localStorage.setItem("exam_total_ms", String(examTotalMs));

    // Force storage event for iframe
    window.dispatchEvent(new Event("storage"));

    // 2. Send via BroadcastChannel (covers different tabs, windows, and iframes on same origin)
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "SYNC_STATE", payload });
      } catch (e) {
        console.warn("BroadcastChannel error:", e);
      }
    }

    // 3. Send to iframe
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "SYNC_STATE", payload }, "*");
    }

    // 4. Send to all opened child windows
    beamerWindowsRef.current.forEach((win) => {
      if (!win.closed) {
        win.postMessage({ type: "SYNC_STATE", payload }, "*");
      }
    });
  }, [
    isLoaded,
    examName,
    duration,
    abgabeMode,
    stapel,
    wcOccupied,
    isPaused,
    remainingTimeMs,
    announcement,
    lehrstuhlText,
    examActive,
    examEnd,
    examTotalMs,
  ]);

  const syncToLocalStorage = (updates: Partial<ExamData> & { active?: boolean; end?: number; totalMs?: number }) => {
    // Handled reactively by the unified sync useEffect.
  };

  // Synchronize on tick to evaluate WC restriction
  const [currentDiff, setCurrentDiff] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (examActive) {
        const now = Date.now();
        const diff = isPaused ? remainingTimeMs : examEnd - now;
        setCurrentDiff(diff);
      } else {
        setCurrentDiff(duration * 60 * 1000);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [examActive, isPaused, examEnd, remainingTimeMs, duration]);

  // Derived WC statuses
  const isWcRestricted = examActive && currentDiff < 15 * 60 * 1000;
  const wcStatusDisplay = isWcRestricted ? "Gesperrt" : wcOccupied ? "Besetzt" : "Frei";
  const wcStatusColor = isWcRestricted ? "red" : wcOccupied ? "orange" : "var(--lmu-green)";

  const openDisplay = () => {
    const baseUrl = window.location.href.split("?")[0].split("#")[0];
    const nextUrl = baseUrl + "?beamer";
    const win = window.open(nextUrl, "_blank", "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no");
    if (win) {
      beamerWindowsRef.current.push(win);
      // Immediately send the current state
      setTimeout(() => {
        if (!win.closed) {
          const payload = {
            examName,
            duration,
            abgabeMode,
            stapel,
            wcOccupied,
            isPaused,
            remainingTimeMs,
            announcement,
            lehrstuhlText,
            examActive,
            examEnd,
            examTotalMs,
          };
          win.postMessage({ type: "SYNC_STATE", payload }, "*");
        }
      }, 300);
    }
  };

  const startExam = () => {
    const totalMsVal = duration * 60 * 1000;
    const endVal = Date.now() + totalMsVal;
    
    setExamActive(true);
    setExamEnd(endVal);
    setExamTotalMs(totalMsVal);
    setIsPaused(false);
    setRemainingTimeMs(totalMsVal);
    if (abgabeMode === "now") setAbgabeMode("off");

    syncToLocalStorage({
      active: true,
      end: endVal,
      totalMs: totalMsVal,
      isPaused: false,
      remainingTimeMs: totalMsVal,
    });
  };

  const togglePause = () => {
    if (!examActive) return;
    const nextPaused = !isPaused;
    const now = Date.now();
    let nextRemaining = remainingTimeMs;
    let nextEnd = examEnd;

    if (nextPaused) {
      nextRemaining = examEnd - now;
      setRemainingTimeMs(nextRemaining);
    } else {
      nextEnd = now + remainingTimeMs;
      setExamEnd(nextEnd);
    }

    setIsPaused(nextPaused);
    syncToLocalStorage({
      isPaused: nextPaused,
      remainingTimeMs: nextRemaining,
      end: nextEnd,
    });
  };

  const endExam = () => {
    setIsEndModalOpen(true);
  };

  const confirmEndExam = () => {
    setExamActive(false);
    setIsPaused(false);
    setRemainingTimeMs(duration * 60 * 1000);
    localStorage.setItem("exam_active", "false");
    localStorage.setItem("exam_end", "0");
    localStorage.setItem("exam_total_ms", String(duration * 60 * 1000));
    syncToLocalStorage({
      active: false,
      isPaused: false,
      remainingTimeMs: duration * 60 * 1000,
    });
    setIsEndModalOpen(false);
  };

  const handleWcToggle = () => {
    if (isWcRestricted) return;
    const nextWc = !wcOccupied;
    setWcOccupied(nextWc);
    syncToLocalStorage({ wcOccupied: nextWc });
  };

  // Preview Scaler using ResizeObserver
  useEffect(() => {
    let animationFrameId: number | null = null;

    const handleResize = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        const container = containerRef.current;
        const frame = iframeRef.current;
        if (container && frame) {
          const scale = container.offsetWidth / 1920;
          frame.style.transform = `scale(${scale})`;
          container.style.height = `${1080 * scale}px`;
        }
      });
    };

    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Call once initially
    handleResize();

    return () => {
      observer.disconnect();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // Auto-grow the announcement textarea to fit its content
  useEffect(() => {
    const el = announcementInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(CONTROL_HEIGHT, el.scrollHeight)}px`;
  }, [announcementDraft]);

  const announcementUnchanged = announcementDraft === announcement;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1">
        <BannerBox text={lehrstuhlText} />

        <div className="dashboard-container" id="admin-dashboard-layout">
        {/* Left Side: Controls */}
        <div className="controls">
          {examActive && (
            <div id="lockNotice" className="lock-notice bg-[#fff3cd] text-[#856404] p-3 mb-4 rounded border border-[#ffeeba]" style={{ fontSize: "0.9rem", lineHeight: "1.5" }}>
              ⚠️ Während die Prüfung läuft, können manche Einstellungen nicht verändert werden. Das Display bleibt während der gesamten Prüfung automatisch angeschaltet.
            </div>
          )}

          {!examActive && (
            <div className="bg-[#e8f4fd] text-[#1a5276] p-3 mb-4 rounded border border-[#aed6f1]" style={{ fontSize: "0.9rem", lineHeight: "1.5" }}>
              ℹ️ Hier können die Prüfungseinstellungen vor Prüfungsbeginn vorgenommen werden. Beim Klicken auf „Beameransicht öffnen" öffnet sich ein zweites Browser-Fenster, das auf dem Beamer als erweiterter Bildschirm platziert und im Vollbildmodus während der Prüfung angezeigt werden kann. Über die Prüfungskontrollen können die angezeigten Informationen in Echtzeit angepasst werden.
            </div>
          )}

          {!examActive && updateVersion && (
            <div id="updateNotice" className="bg-[#e8f4fd] text-[#1a5276] p-3 mb-4 rounded border border-[#aed6f1]" style={{ fontSize: "0.9rem", lineHeight: "1.5" }}>
              🔄 Version {updateVersion} ist verfügbar –{" "}
              <a
                href={downloadUrlForPlatform(navigator.userAgent)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", fontWeight: 600 }}
              >
                jetzt herunterladen
              </a>
              . Die App bleibt auch ohne Update voll funktionsfähig.
            </div>
          )}

          <h2 style={{ margin: 0, marginBottom: "20px" }}>Prüfungseinstellungen</h2>

          <div className="input-group" style={{ marginBottom: "20px" }}>
            <label htmlFor="lehrstuhlText">Lehrstuhlname</label>
            <input
              type="text"
              id="lehrstuhlText"
              value={lehrstuhlText}
              onChange={(e) => {
                setLehrstuhlText(e.target.value);
                syncToLocalStorage({ lehrstuhlText: e.target.value });
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "10px", opacity: examActive ? 0.5 : 1, transition: "opacity 0.2s" }}>
            <div className="input-group" style={{ flex: 3 }}>
              <label htmlFor="examName" style={{ color: examActive ? "#8c918c" : "#333", transition: "color 0.2s" }}>Name der Prüfung</label>
              <input
                type="text"
                id="examName"
                value={examName}
                disabled={examActive}
                className="lockable disabled:opacity-50 disabled:bg-[#f1f3f1] disabled:text-[#8c918c] disabled:border-[#cccccc] disabled:cursor-not-allowed"
                onChange={(e) => {
                  setExamName(e.target.value);
                  syncToLocalStorage({ name: e.target.value });
                }}
              />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label htmlFor="duration" style={{ color: examActive ? "#8c918c" : "#333", transition: "color 0.2s" }}>Dauer (Min)</label>
              <input
                type="number"
                id="duration"
                min={1}
                value={durationRaw}
                disabled={examActive}
                className="lockable disabled:opacity-50 disabled:bg-[#f1f3f1] disabled:text-[#8c918c] disabled:border-[#cccccc] disabled:cursor-not-allowed"
                onChange={(e) => {
                  const raw = e.target.value;
                  setDurationRaw(raw);
                  const parsed = parseInt(raw, 10);
                  if (parsed > 0) {
                    setDuration(parsed);
                    syncToLocalStorage({ duration: parsed });
                  }
                }}
                onBlur={() => {
                  const clamped = Math.max(1, parseInt(durationRaw, 10) || 0);
                  setDuration(clamped);
                  setDurationRaw(String(clamped));
                  syncToLocalStorage({ duration: clamped });
                }}
              />
            </div>
          </div>

          <label style={{ display: "block", fontWeight: "bold", fontSize: "0.85rem", textTransform: "uppercase", marginBottom: "8px", marginTop: "8px", color: "#333" }}>Abgabeeinstellungen (angeordnet aus Sicht der Prüfungsteilnehmer)</label>
          <div className="flex gap-2.5 mb-4 items-center">
            {stapel.map((val, idx) => (
              <input
                key={idx}
                type="text"
                value={val}
                disabled={abgabeMode === "off"}
                className="flex-1 text-center disabled:bg-[#f1f3f1] disabled:text-[#8c918c] disabled:border-[#cccccc] disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(e) => setStapel(stapel.map((v, i) => (i === idx ? e.target.value : v)))}
              />
            ))}
            <button
              onClick={() => setStapel(stapel.slice(0, -1))}
              disabled={stapel.length <= MIN_STAPEL}
              title="Stapel entfernen"
              style={{
                flexShrink: 0,
                width: CONTROL_HEIGHT,
                height: CONTROL_HEIGHT,
                background: "#eeeeee",
                color: stapel.length <= MIN_STAPEL ? "#aaaaaa" : "#cc0000",
                border: "1px solid #cccccc",
                fontWeight: "bold",
                fontSize: "1.2rem",
                cursor: stapel.length <= MIN_STAPEL ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              −
            </button>
            <button
              onClick={() => setStapel([...stapel, ""])}
              disabled={stapel.length >= MAX_STAPEL}
              title="Stapel hinzufügen"
              style={{
                flexShrink: 0,
                width: CONTROL_HEIGHT,
                height: CONTROL_HEIGHT,
                background: stapel.length >= MAX_STAPEL ? "#cccccc" : "var(--lmu-dark-green)",
                color: stapel.length >= MAX_STAPEL ? "#666666" : "white",
                border: "none",
                fontWeight: "bold",
                fontSize: "1.2rem",
                cursor: stapel.length >= MAX_STAPEL ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              +
            </button>
          </div>

          <div className="my-[15px]">
            <div className="flex gap-2">
              {(["off", "auto"] as AbgabeMode[]).map((mode) => {
                const modeLabels: Record<"off" | "auto", string> = {
                  off: "Nicht anzeigen",
                  auto: "Automatisch Nach Prüfungsende",
                };
                const isSelected = baseAbgabeMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => { setBaseAbgabeMode(mode); setAbgabeMode(mode); }}
                    style={{
                      flex: 1,
                      height: CONTROL_HEIGHT,
                      padding: "0 4px",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      background: isSelected ? "var(--lmu-dark-green)" : "white",
                      color: isSelected ? "white" : "var(--lmu-dark-green)",
                      border: "2px solid var(--lmu-dark-green)",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {modeLabels[mode]}
                  </button>
                );
              })}
            </div>
          </div>


          <hr className="divider" />

          <h2 style={{ margin: 0, marginBottom: "20px" }}>Prüfungskontrollen</h2>

          {/* Bottom action buttons */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {/* 1 — Start / Beenden */}
            <button
              id="startBtn"
              onClick={!examActive ? startExam : endExam}
              style={{
                flex: 1,
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                background: !examActive ? "var(--lmu-green)" : "#cc0000",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                lineHeight: 1.2,
                padding: "8px 4px",
              }}
            >
              {!examActive ? <Play size={32} /> : <Square size={32} />}
              {!examActive ? "Prüfung starten" : "Beenden"}
            </button>

            {/* 2 — Pause / Reaktivieren */}
            <button
              id="pauseBtn"
              onClick={() => isPaused ? togglePause() : setIsPauseModalOpen(true)}
              disabled={!examActive}
              style={{
                flex: 1,
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                background: !examActive ? "#cccccc" : isPaused ? "var(--lmu-green)" : "var(--lmu-dark-green)",
                color: !examActive ? "#666666" : "white",
                border: "none",
                cursor: !examActive ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                lineHeight: 1.2,
                padding: "8px 4px",
                opacity: !examActive ? 0.5 : 1,
                transition: "opacity 0.2s, background 0.2s",
              }}
            >
              {isPaused ? <Play size={32} /> : <Pause size={32} />}
              {isPaused ? "Reaktivieren" : "Pausieren"}
            </button>

            {/* 3 — Jetzt anzeigen (Abgabe) */}
            <button
              id="abgabeJetztBtn"
              disabled={abgabeMode === "off"}
              onClick={() => {
                if (abgabeMode === "now") {
                  setAbgabeMode(baseAbgabeMode);
                } else if (examActive) {
                  setIsAbgabeModalOpen(true);
                } else {
                  setAbgabeMode("now");
                }
              }}
              style={{
                flex: 1,
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                background: abgabeMode === "off" ? "#cccccc" : "var(--lmu-dark-green)",
                color: abgabeMode === "off" ? "#666666" : "white",
                border: "none",
                outline: "none",
                cursor: abgabeMode === "off" ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                lineHeight: 1.2,
                padding: "8px 4px",
                boxSizing: "border-box",
                opacity: abgabeMode === "off" ? 0.5 : 1,
                transition: "opacity 0.2s, background 0.2s",
              }}
            >
              <Layers size={32} />
              {abgabeMode === "now" ? "Abgabestapel verbergen" : "Abgabestapel anzeigen"}
            </button>

            {/* 4 — WC toggle */}
            <button
              id="wcToggleBtn"
              onClick={handleWcToggle}
              disabled={isWcRestricted}
              style={{
                flex: 1,
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                background: isWcRestricted ? "#cccccc" : wcOccupied ? "#727972" : "var(--lmu-dark-green)",
                color: isWcRestricted ? "#666666" : "white",
                border: "none",
                cursor: isWcRestricted ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                lineHeight: 1.2,
                padding: "8px 4px",
                opacity: isWcRestricted ? 0.5 : 1,
                transition: "opacity 0.2s, background 0.2s",
              }}
            >
              <img src={wcIconImg} alt="" style={{ height: 40, width: "auto", filter: isWcRestricted ? "brightness(0)" : "brightness(0) invert(1)" }} />
              {wcOccupied ? "WC Freigeben" : "WC Belegen"}
            </button>
          </div>

          {/* Ankündigungen input row */}
          <div className="flex gap-2 items-start w-full" style={{ marginTop: "8px", marginBottom: "8px" }}>
            <textarea
              ref={announcementInputRef}
              id="announcementInput"
              rows={1}
              wrap="off"
              placeholder="Hier Ankündigungen eingeben und mit Button anzeigen lassen oder löschen."
              value={announcementDraft}
              onChange={(e) => setAnnouncementDraft(e.target.value)}
              className="flex-1 p-2.5 border border-neutral-300 bg-white box-border focus:outline-none focus:border-[var(--lmu-green)] text-sm rounded-sm resize-none overflow-hidden"
              style={{ height: `${CONTROL_HEIGHT}px`, lineHeight: "1.5", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
            />
            <button
              id="clearAnnouncementBtn"
              onClick={() => {
                setAnnouncementDraft("");
                setAnnouncement("");
                syncToLocalStorage({ announcement: "" });
              }}
              title="Aktuelle Ankündigung löschen"
              className="btn-base flex items-center justify-center cursor-pointer shrink-0"
              style={{
                width: `${CONTROL_HEIGHT}px`,
                background: "#eeeeee",
                color: "#cc0000",
                border: "1px solid #cccccc",
                fontWeight: "bold",
                transition: "background 0.2s"
              }}
            >
              <X size={18} />
            </button>
            <button
              id="sendAnnouncementBtn"
              onClick={() => {
                setAnnouncement(announcementDraft);
                syncToLocalStorage({ announcement: announcementDraft });
              }}
              disabled={announcementUnchanged}
              title="Ankündigung anzeigen"
              className="btn-base flex items-center justify-center shrink-0"
              style={{
                width: `${CONTROL_HEIGHT}px`,
                background: announcementUnchanged ? "#cccccc" : "var(--lmu-dark-green)",
                color: announcementUnchanged ? "#666666" : "white",
                border: "none",
                fontWeight: "bold",
                opacity: announcementUnchanged ? 0.5 : 1,
                cursor: announcementUnchanged ? "not-allowed" : "pointer",
                transition: "opacity 0.2s, background 0.2s"
              }}
            >
              <Send size={18} />
            </button>
          </div>

          <hr className="divider" />

          {/* Wide Beamer button */}
          <button
            onClick={openDisplay}
            id="beamer-offnen-btn"
            style={{
              width: "100%",
              height: CONTROL_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              background: "#333",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "0.9rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            🖥 Beameransicht öffnen
          </button>
        </div>

        {/* Right Side: Live preview iframe */}
        <div className="preview">
          <div className="mb-2.5 text-neutral-600 font-bold text-sm tracking-wide">📡 LIVE PREVIEW</div>
          <div id="pContainer" ref={containerRef} className="w-full bg-[#eee] relative overflow-hidden border-2 border-neutral-600">
            <iframe
              src={window.location.href.split("?")[0].split("#")[0] + "?beamer"}
              id="previewFrame"
              ref={iframeRef}
              title="Live Beamer Preview"
              className="w-[1920px] height-[1080px] border-none absolute top-0 left-0 origin-top-left pointer-events-none"
              style={{ width: "1920px", height: "1080px" }}
            />
          </div>
        </div>
      </div>
      </div>

      {isEndModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-[var(--lmu-green)] p-8 max-w-md w-full relative box-border shadow-2xl text-left">
            <div className="absolute top-0 left-0 w-[25px] h-[25px] bg-[var(--lmu-green)]" />
            
            <h3 className="text-[var(--lmu-green)] font-bold text-xl mb-4 mt-2">
              Prüfung beenden
            </h3>
            
            <p className="text-neutral-700 text-sm mb-6 leading-relaxed">
              Aktuelle Prüfung wirklich beenden? Countdown wird dadurch zurückgesetzt.
            </p>
            
            <div className="flex gap-4">
              <button
                onClick={() => setIsEndModalOpen(false)}
                className="px-5 py-3 font-bold bg-[#eeeeee] text-[#222222] border border-[#cccccc] cursor-pointer hover:bg-[#e2e2e2] transition uppercase tracking-wide flex-1 text-center text-xs"
              >
                Zurück
              </button>
              <button
                onClick={confirmEndExam}
                className="px-5 py-3 font-bold bg-[#cc0000] text-white cursor-pointer hover:bg-[#b00000] transition uppercase tracking-wide flex-1 text-center text-xs"
              >
                Prüfung beenden
              </button>
            </div>
          </div>
        </div>
      )}

      {isPauseModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-[var(--lmu-green)] p-8 max-w-md w-full relative box-border shadow-2xl text-left">
            <div className="absolute top-0 left-0 w-[25px] h-[25px] bg-[var(--lmu-green)]" />

            <h3 className="text-[var(--lmu-green)] font-bold text-xl mb-4 mt-2">
              Prüfung pausieren
            </h3>

            <p className="text-neutral-700 text-sm mb-6 leading-relaxed">
              Prüfung wirklich pausieren? Der Countdown wird dadurch pausiert und kann später wieder fortgesetzt werden.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setIsPauseModalOpen(false)}
                className="px-5 py-3 font-bold bg-[#eeeeee] text-[#222222] border border-[#cccccc] cursor-pointer hover:bg-[#e2e2e2] transition uppercase tracking-wide flex-1 text-center text-xs"
              >
                Zurück
              </button>
              <button
                onClick={() => {
                  togglePause();
                  setIsPauseModalOpen(false);
                }}
                className="px-5 py-3 font-bold bg-[var(--lmu-dark-green)] text-white cursor-pointer hover:bg-[#005023] transition uppercase tracking-wide flex-1 text-center text-xs"
              >
                Prüfung pausieren
              </button>
            </div>
          </div>
        </div>
      )}

      {isAbgabeModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-[var(--lmu-green)] p-8 max-w-md w-full relative box-border shadow-2xl text-left">
            <div className="absolute top-0 left-0 w-[25px] h-[25px] bg-[var(--lmu-green)]" />

            <h3 className="text-[var(--lmu-green)] font-bold text-xl mb-4 mt-2">
              Abgabe jetzt anzeigen
            </h3>

            <p className="text-neutral-700 text-sm mb-6 leading-relaxed">
              Abgabestapel sofort anzeigen? Der Countdown läuft im Hintergrund weiter. Die Countdown-Anzeige kann jederzeit wieder projiziert werden.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setIsAbgabeModalOpen(false)}
                className="px-5 py-3 font-bold bg-[#eeeeee] text-[#222222] border border-[#cccccc] cursor-pointer hover:bg-[#e2e2e2] transition uppercase tracking-wide flex-1 text-center text-xs"
              >
                Zurück
              </button>
              <button
                onClick={() => {
                  setAbgabeMode("now");
                  setIsAbgabeModalOpen(false);
                }}
                className="px-5 py-3 font-bold bg-[var(--lmu-dark-green)] text-white cursor-pointer hover:bg-[#005023] transition uppercase tracking-wide flex-1 text-center text-xs"
              >
                Abgabe anzeigen
              </button>
            </div>
          </div>
        </div>
      )}
      <footer className="dashboard-footer">
        Programmiert von{" "}
        <a
          href="https://www.linkedin.com/in/zeller-florian/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "inherit", font: "inherit" }}
        >
          Florian Zeller
        </a>{" "}
        💻 am Lehrstuhl für Öffentliches Recht und Staatsphilosophie
        {" · v"}
        {__APP_VERSION__}
      </footer>
    </div>
  );
}

/* ==========================================
   BEAMER VIEW
   ========================================== */
function BeamerView() {
  const receivedPostMessageRef = useRef(false);
  const [examName, setExamName] = useState("VÜ ÖffR");
  const [duration, setDuration] = useState(90);
  const [abgabeMode, setAbgabeMode] = useState<AbgabeMode>("off");
  const [stapel, setStapel] = useState<string[]>([...DEFAULT_STAPEL]);

  const [wcOccupied, setWcOccupied] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [remainingTimeMs, setRemainingTimeMs] = useState(0);

  const [examActive, setExamActive] = useState(false);
  const [examEnd, setExamEnd] = useState(0);
  const [examTotalMs, setExamTotalMs] = useState(0);

  const [timeVal, setTimeVal] = useState("1:30");
  const [timeUnits, setTimeUnits] = useState<[string, string]>(["std", "min"]);
  const [timerLabel, setTimerLabel] = useState("KLAUSUR BEGINNT KÜRZE");
  const [progressWidth, setProgressWidth] = useState("100%");
  const [timerColor, setTimerColor] = useState("#222");

  const [announcement, setAnnouncement] = useState("");
  const [announcementFontSize, setAnnouncementFontSize] = useState("1.8vw");
  const [lehrstuhlText, setLehrstuhlText] = useState(LEHRSTUHL_DEFAULT);

  const [footerTimedOut, setFooterTimedOut] = useState(false);

  // Anchored in localStorage (not component-mount time) so the preview iframe and the
  // real Beamer popup window — which mount at different times — hide the footer in sync.
  useEffect(() => {
    const FOOTER_VISIBLE_MS = 2.5 * 60 * 1000;
    const STORAGE_KEY = "beamer_footer_shown_at";

    let shownAt = parseInt(localStorage.getItem(STORAGE_KEY) || "", 10);
    if (!shownAt || Number.isNaN(shownAt)) {
      shownAt = Date.now();
      localStorage.setItem(STORAGE_KEY, String(shownAt));
    }

    const remaining = FOOTER_VISIBLE_MS - (Date.now() - shownAt);
    if (remaining <= 0) {
      setFooterTimedOut(true);
      return;
    }

    const timer = setTimeout(() => setFooterTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!announcement) {
      setAnnouncementFontSize("1.8vw");
      return;
    }

    const initialSize = announcement.length > 250 ? 1.2 : announcement.length > 150 ? 1.5 : 1.8;
    setAnnouncementFontSize(`${initialSize}vw`);

    const timer = setTimeout(() => {
      const doc = document.documentElement;
      let size = initialSize;
      
      while (size > 0.6 && doc.scrollHeight > doc.clientHeight) {
        size -= 0.1;
        const textEl = document.getElementById("announcement-text");
        if (textEl) {
          textEl.style.fontSize = `${size}vw`;
        }
      }
      setAnnouncementFontSize(`${size}vw`);
    }, 50);

    return () => clearTimeout(timer);
  }, [announcement]);

  const [showAbgabe, setShowAbgabe] = useState(false);
  const [wcStateClass, setWcStateClass] = useState("wc-box wc-frei");
  const [wcText, setWcText] = useState("WC VERFÜGBAR");

  // Load and subscribe to updates from localStorage
  const loadExamData = () => {
    const rawData = localStorage.getItem("examData");
    if (rawData) {
      try {
        const data: ExamData = JSON.parse(rawData);
        setExamName(data.name || "VÜ ÖffR");
        setDuration(data.duration || 90);
        setAbgabeMode(parseAbgabeMode(data));
        setStapel(parseStapel(data));
        setWcOccupied(data.wcOccupied ?? false);
        setIsPaused(data.isPaused ?? false);
        setRemainingTimeMs(data.remainingTimeMs ?? 0);
        setAnnouncement(data.announcement || "");
        setLehrstuhlText(data.lehrstuhlText || LEHRSTUHL_DEFAULT);
      } catch (e) {
        console.error("Error reading examData", e);
      }
    }

    const activeStr = localStorage.getItem("exam_active");
    setExamActive(activeStr === "true");

    const endStr = localStorage.getItem("exam_end");
    if (endStr) setExamEnd(parseInt(endStr, 10));

    const totalStr = localStorage.getItem("exam_total_ms");
    if (totalStr) setExamTotalMs(parseInt(totalStr, 10));
  };

  useEffect(() => {
    loadExamData();

    const applyState = (data: any) => {
      if (data.hasOwnProperty("examName")) setExamName(data.examName);
      if (data.hasOwnProperty("duration")) setDuration(data.duration);
      if (data.hasOwnProperty("abgabeMode") || data.hasOwnProperty("autoAbgabe")) setAbgabeMode(parseAbgabeMode(data));
      if (data.hasOwnProperty("stapel") || data.hasOwnProperty("s1")) setStapel(parseStapel(data));
      if (data.hasOwnProperty("wcOccupied")) setWcOccupied(data.wcOccupied);
      if (data.hasOwnProperty("isPaused")) setIsPaused(data.isPaused);
      if (data.hasOwnProperty("remainingTimeMs")) setRemainingTimeMs(data.remainingTimeMs);
      if (data.hasOwnProperty("announcement")) setAnnouncement(data.announcement);
      if (data.hasOwnProperty("lehrstuhlText")) setLehrstuhlText(data.lehrstuhlText);
      if (data.hasOwnProperty("examActive")) setExamActive(data.examActive);
      if (data.hasOwnProperty("examEnd")) setExamEnd(data.examEnd);
      if (data.hasOwnProperty("examTotalMs")) setExamTotalMs(data.examTotalMs);
    };

    // 1. Listen to localStorage changes in real time (covers popups, other tabs etc)
    window.addEventListener("storage", loadExamData);

    // 2. Listen to BroadcastChannel for instant real-time synchronization
    let broadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel("lmu_klausur_channel");
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === "SYNC_STATE") {
          receivedPostMessageRef.current = true;
          applyState(event.data.payload);
        }
      };
    } catch (e) {
      console.warn("BroadcastChannel error in Beamer:", e);
    }

    // 3. Listen to direct synchronization messages via postMessage
    const handleSyncMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "SYNC_STATE") {
        receivedPostMessageRef.current = true;
        applyState(event.data.payload);
      }
    };
    window.addEventListener("message", handleSyncMessage);

    // 4. Fast polling fallback/recovery in background (covers instant iframe updates and other subtle sync issues)
    const pollTimer = setInterval(loadExamData, 200);

    // 5. Request synchronization via BroadcastChannel NOW that all listeners are active and ready
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: "REQUEST_SYNC" });
      } catch (e) {}
    }

    // 6. Prompt parent or opener to synchronize initial state
    if (window.opener) {
      window.opener.postMessage({ type: "REQUEST_SYNC" }, "*");
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "REQUEST_SYNC" }, "*");
    }

    return () => {
      window.removeEventListener("storage", loadExamData);
      window.removeEventListener("message", handleSyncMessage);
      clearInterval(pollTimer);
      if (broadcastChannel) {
        broadcastChannel.close();
      }
    };
  }, []);

  const formatRemaining = (ms: number): { text: string; units: [string, string] } => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    if (ms < 15 * 60 * 1000) {
      // under 15 min: minutes : seconds
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return { text: `${m}:${s.toString().padStart(2, "0")}`, units: ["min", "sek"] };
    }
    // 15 min or more: hours : minutes (floor — show time already counting down)
    const totalMinutes = Math.floor(totalSeconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) {
      // 15–59 min: minutes only, no leading "0 std"
      return { text: `${m}`, units: ["min", "min"] };
    }
    return { text: `${h}:${m.toString().padStart(2, "0")}`, units: ["std", "min"] };
  };

  // Timer Tick Update Logic
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const diff = isPaused ? remainingTimeMs : examEnd - now;

      // Determine abgabe view visibility — always continue updating timer state so it's current when dismissed
      setShowAbgabe(
        abgabeMode === "now" ||
        (abgabeMode === "auto" && examActive && diff < -ABGABE_BUFFER_MS)
      );

      if (examActive) {
        if (diff <= 0) {
          setTimeVal("0:00");
          setTimeUnits(["min", "sek"]);
          setTimerColor("red");
          setProgressWidth("0%");
        } else {
          const r = formatRemaining(diff);
          setTimeVal(r.text);
          setTimeUnits(r.units);
          setProgressWidth(`${(diff / examTotalMs) * 100}%`);
          setTimerColor(isPaused ? "orange" : "#222");
          setTimerLabel(isPaused ? "PAUSIERT" : "VERBLEIBENDE ZEIT");
        }

        // WC Box Logic
        if (diff < 15 * 60 * 1000) {
          setWcStateClass("wc-box wc-gesperrt");
          setWcText("WC NICHT VERFÜGBAR");
        } else {
          setWcStateClass(wcOccupied ? "wc-box wc-besetzt" : "wc-box wc-frei");
          setWcText(wcOccupied ? "WC BESETZT" : "WC VERFÜGBAR");
        }
      } else {
        const rPrep = formatRemaining(duration * 60 * 1000);
        setTimeVal(rPrep.text);
        setTimeUnits(rPrep.units);
        setProgressWidth("100%");
        setTimerLabel("KLAUSUR STARTET IN KÜRZE");
        setTimerColor("#222");

        // During preparation, WC is always free/occupied depending just on status, never locked
        setWcStateClass(wcOccupied ? "wc-box wc-besetzt" : "wc-box wc-frei");
        setWcText(wcOccupied ? "WC BESETZT" : "WC VERFÜGBAR");
      }
    };

    // Keep ticking every 200ms
    const ticker = setInterval(tick, 200);
    tick(); // run immediately

    return () => clearInterval(ticker);
  }, [examActive, isPaused, remainingTimeMs, examEnd, examTotalMs, abgabeMode, duration, wcOccupied]);

  // Handle dynamic font size scaling for large timers
  const timeValStyle = {
    fontSize: timeVal.length > 5 ? "9vw" : "11vw",
    color: timerColor,
  };

  return (
    <div className="display-body">
      <BannerBox text={lehrstuhlText} />

      {!showAbgabe ? (
        <motion.div id="mainView" className="beamer-content" layout={examActive} transition={{ duration: 0.5, ease: "easeInOut" }}>
          <div className="main-layout-group">
            <div className="title-area">
              <div id="displayTitle" className="exam-title uppercase">
                {examName || "LADE..."}
              </div>
            </div>

            <div className="timer-layout">
              <div className="timer-box">
                <span id="timerLabel" className="text-[1.8vw] text-neutral-500 font-bold mb-1 uppercase">
                  {timerLabel}
                </span>
                <div id="timeVal" className="timer-val tracking-tight font-black" style={timeValStyle}>
                  {timeVal.split(":").map((part, i) => (
                    <span key={i} className="time-seg">
                      {part}
                      <span className="time-unit">{timeUnits[i]}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div id="wcBox" className={wcStateClass}>
                <img src={wcIconImg} className="wc-icon-img" alt="WC Icon" />
                <div id="wcText" className="text-[1.7vw] uppercase tracking-wide">
                  {wcText}
                </div>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {announcement && (
                <motion.div
                  initial={{ opacity: 0, height: 0, scaleY: 0.8, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", scaleY: 1, marginBottom: 30 }}
                  exit={{ opacity: 0, height: 0, scaleY: 0.8, marginBottom: 0 }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  className="w-full origin-top "
                >
                  <div 
                    className="relative border-2 border-[var(--lmu-green)] bg-white text-left w-full box-border"
                    style={{
                      paddingTop: "max(45px, 2.5vw)",
                      paddingBottom: "max(45px, 2.5vw)",
                      paddingLeft: "4vw",
                      paddingRight: "4vw"
                    }}
                  >
                    <div className="absolute top-0 left-0 w-[35px] h-[35px] bg-[var(--lmu-green)]" />
                    <div className="text-[1.2vw] text-neutral-500 font-bold tracking-wider mb-2 uppercase">
                      ANKÜNDIGUNG
                    </div>
                    <div 
                      id="announcement-text"
                      className="font-bold text-[#111111] leading-snug"
                      style={{ fontSize: announcementFontSize }}
                    >
                      {announcement}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="progress-container">
              <div id="pBar" className="progress-bar" style={{ width: progressWidth }} />
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div id="abgabeView" className="beamer-content block" layout={examActive} transition={{ duration: 0.5, ease: "easeInOut" }}>
          <div className="text-[4vw] font-bold mb-10 text-center tracking-tight text-[var(--lmu-green)]">
            Abgabe nach Namensgruppen
          </div>
          <div
            className="stapel-container"
            style={{ gridTemplateColumns: `repeat(${stapel.length}, 1fr)` }}
          >
            {stapel.map((range, i) => (
              <div key={i} className="stapel-box rounded-xs shadow-xs">
                <div className="stapel-label">{stapelLabel(i, stapel.length)}</div>
                <div className="stapel-names">{range}</div>
                <svg
                  className="arrow-svg"
                  style={{ transform: `rotate(${arrowAngle(i, stapel.length)}deg)` }}
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="popLayout">
        {!examActive && !footerTimedOut && (
          <motion.footer
            className="dashboard-footer beamer-footer"
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            Programmiert von{" "}
            <a
              href="https://www.linkedin.com/in/zeller-florian/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "inherit", font: "inherit" }}
            >
              Florian Zeller
            </a>{" "}
            💻 am Lehrstuhl für Öffentliches Recht und Staatsphilosophie
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}

