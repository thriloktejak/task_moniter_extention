// ================= CONFIG =================
const TARGET_MATCH = "https://www.parimango.com/api/tasks";
const ALARM_NAME = "task-monitor-alarm";
const SOUND_FILE = "sound.mp3";

console.log("[TaskMonitor] Background loaded");

// ================= START / STOP =================
chrome.runtime.onMessage.addListener((msg) => {
  console.log("[TaskMonitor] Message:", msg);

  if (msg.type === "START_MONITOR") startMonitoring();
  if (msg.type === "STOP_MONITOR") stopMonitoring();
});

// ================= START =================
async function startMonitoring() {
  const { interval } = await chrome.storage.local.get("interval");

  console.log("[TaskMonitor] Start requested. Interval:", interval);

  if (!interval || interval < 5) {
    console.warn("[TaskMonitor] Invalid interval");
    return;
  }

  await chrome.alarms.clear(ALARM_NAME);

  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: interval / 60,
  });

  console.log("[TaskMonitor] Alarm started");
}

// ================= STOP =================
async function stopMonitoring() {
  await chrome.alarms.clear(ALARM_NAME);
  console.log("[TaskMonitor] Alarm stopped");
}

// ================= ALARM EVENT =================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  console.log("[TaskMonitor] Alarm triggered → finding tab");

  const tabs = await chrome.tabs.query({});
  
  
  const targetTab = tabs.find((t) => t.url && t.url.includes(TARGET_MATCH));
console.log("[TaskMonitor] Tabs found:", tabs.length);
  if (!targetTab) {
    console.warn("[TaskMonitor] Target tab not open");
    return;
  }

  console.log("[TaskMonitor] Reloading tab ID:", targetTab.id);

  // Reload WITHOUT focusing
  chrome.tabs.reload(targetTab.id);
});

// ================= AFTER TAB LOAD =================
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  if (!tab.url || !tab.url.includes(TARGET_MATCH)) return;

  console.log("[TaskMonitor] Target tab reloaded → checking content");

  checkTabContent(tabId);
});

// ================= READ PAGE CONTENT =================
async function checkTabContent(tabId) {
  try {
    const { keywords, enabled } = await chrome.storage.local.get([
      "keywords",
      "enabled",
    ]);

    if (!enabled || !keywords?.length) {
      console.log("[TaskMonitor] Disabled or no keywords");
      return;
    }

    console.log("[TaskMonitor] Injecting script to read page");

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body.innerText,
    });

    const pageText = results?.[0]?.result || "";

    console.log("[TaskMonitor] Page length:", pageText.length);

    const found = keywords.find((k) =>
      pageText.toLowerCase().includes(k.toLowerCase())
    );

    if (found) {
      console.log("[TaskMonitor] MATCH FOUND →", found);
      playSound();
    } else {
      console.log("[TaskMonitor] No match");
    }
  } catch (err) {
    console.error("[TaskMonitor] Content check failed:", err);
  }
}

// ================= PLAY SOUND =================
async function playSound() {
  console.log("[TaskMonitor] Preparing offscreen audio playback");

  // Check if offscreen already exists
  const hasOffscreen = await chrome.offscreen.hasDocument();

  if (!hasOffscreen) {
    console.log("[TaskMonitor] Creating offscreen document");

    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play alert sound when keyword found",
    });

    // IMPORTANT: small delay to allow listener to register
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log("[TaskMonitor] Sending PLAY_SOUND message");

  try {
    await chrome.runtime.sendMessage({ type: "PLAY_SOUND" });
  } catch (err) {
    console.error("[TaskMonitor] Message send failed:", err);
  }
}

