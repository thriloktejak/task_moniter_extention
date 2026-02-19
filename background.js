// ================= CONFIG =================
const ALARM_NAME = "task-monitor-alarm";
const SOUND_FILE = "sound.mp3";

console.log("[TaskMonitor] Background loaded");

let isAlarmActive = false;
let isMonitoringPaused = false;
// ================= AUTO START ON BROWSER OPEN =================
chrome.runtime.onStartup.addListener(initMonitoring);
chrome.runtime.onInstalled.addListener(initMonitoring);

async function initMonitoring() {
  const { enabled } = await chrome.storage.local.get("enabled");

  if (enabled) {
    console.log("[TaskMonitor] Auto-starting monitoring on browser start");
    startMonitoring();
    isAlarmActive = false;
  }
}

// ================= START / STOP =================
// ================= START / STOP / RESTART =================
chrome.runtime.onMessage.addListener((msg) => {
  console.log("[TaskMonitor] Message:", msg);

  if (msg.type === "START_MONITOR") {
    startMonitoring();
  }

  if (msg.type === "STOP_MONITOR") {
    stopMonitoring();
  }

  if (msg.type === "RESTART_MONITOR") {
    console.log("[TaskMonitor] Restarting monitor with new interval");

    stopMonitoring().then(() => {
      startMonitoring();
    });
   
  }
   if (msg.type === "ALARM_STOPPED") {
  console.log("[TaskMonitor] Alarm stopped → releasing lock");
    isAlarmActive = false;
  isMonitoringPaused = false;

  chrome.storage.local.set({
    alarmPlaying: false
  });

  // restart monitoring automatically if enabled
  chrome.storage.local.get("enabled").then(({ enabled }) => {
    if (enabled) startMonitoring();
  });
}
  if (msg.type === "ALARM_STARTED") {
  console.log("[TaskMonitor] Alarm started → pausing monitoring");

  isAlarmActive = true;
  isMonitoringPaused = true;

  chrome.storage.local.set({
    alarmPlaying: true
  });

  // stop further alarm cycles
  chrome.alarms.clear(ALARM_NAME);
  }
});

// ================= START =================
async function startMonitoring() {
  const { interval } = await chrome.storage.local.get("interval");

  console.log("[TaskMonitor] Start requested. Interval:", interval);

  if (!interval || interval < 5) {
    console.warn("[TaskMonitor] Invalid interval");
    return;
  }

  await chrome.alarms.clearAll();

  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: interval / 60,
  });

  console.log("[TaskMonitor] Alarm started");
}

// ================= STOP =================
async function stopMonitoring() {
  await chrome.alarms.clearAll();
  console.log("[TaskMonitor] Alarm stopped");
}

// ================= ALARM EVENT =================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

    if (isMonitoringPaused) {
    console.log("[TaskMonitor] Monitoring paused → skipping cycle");
    return;
  }
  console.log("[TaskMonitor] Alarm triggered → finding tab");


  const tabs = await chrome.tabs.query({});

  const { targetUrl } = await chrome.storage.local.get("targetUrl");

if (!targetUrl) {
  console.warn("[TaskMonitor] No target URL configured");
  return;
}

const targetTab = tabs.find((t) => t.url && t.url.includes(targetUrl));

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
  const { targetUrl } = await chrome.storage.local.get("targetUrl");

if (!targetUrl || !tab.url || !tab.url.includes(targetUrl)) return;


  console.log("[TaskMonitor] Target tab reloaded → checking content");

  checkTabContent(tabId);
});

// ================= READ PAGE CONTENT =================
async function checkTabContent(tabId) {
  if (isMonitoringPaused) {
  console.log("[TaskMonitor] Skipping content check (paused)");
  return;
}
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

   const { minCount = 1 } = await chrome.storage.local.get("minCount");

let totalMatches = 0;

for (const k of keywords) {
  const regex = new RegExp(k, "gi");
  const matches = pageText.match(regex);
  if (matches) totalMatches += matches.length;
}

console.log("[TaskMonitor] Total keyword matches:", totalMatches, "Min required:", minCount);

if (totalMatches >= minCount) {
      console.log("[TaskMonitor] MATCH FOUND →", totalMatches, "matches");
      if (isAlarmActive) {
        console.log("[TaskMonitor] Alarm already active → skip");
        return;
      }

      isAlarmActive = true;
      playSound();
      showNotification();
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
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log("[TaskMonitor] Sending PLAY_SOUND message");

  try {
    await chrome.runtime.sendMessage({ type: "PLAY_SOUND" });
  } catch (err) {
    console.error("[TaskMonitor] Message send failed:", err);
  }
}

// ================= SHOW DESKTOP NOTIFICATION =================
function showNotification() {
  chrome.notifications.create("task-monitor-alert", {
    type: "basic",
    iconUrl: "icon.png", // make sure icon.png exists
    title: "Task Monitor",
    message: "New tasks are posted on the site",
    buttons: [
      { title: "Stop Alarm" }
    ],
    priority: 2
  });
}


// ================= NOTIFICATION BUTTON CLICK =================
if (chrome.notifications && chrome.notifications.onButtonClicked) {
  chrome.notifications.onButtonClicked.addListener(async (notifId, btnIndex) => {
    if (notifId !== "task-monitor-alert") return;

    console.log("[TaskMonitor] Notification Stop button clicked");

    await chrome.runtime.sendMessage({ type: "STOP_SOUND" });
    chrome.notifications.clear("task-monitor-alert");
    isAlarmActive = false;
  });
}
