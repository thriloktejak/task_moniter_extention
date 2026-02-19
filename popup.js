// Popup UI Logic for Task Monitor

// Ensure DOM is fully loaded before accessing elements
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchText");
  const addBtn = document.getElementById("addKeyword");
  const keywordListEl = document.getElementById("keywordList");
  const intervalInput = document.getElementById("interval");
  const saveBtn = document.getElementById("startBtn");
  const statusEl = document.getElementById("status");
  const toggleEl = document.getElementById("toggleMonitor");

  const previewText = document.getElementById("previewText");
  const previewInterval = document.getElementById("previewInterval");
  const stopAlarmBtn = document.getElementById("stopAlarmBtn");
  const minCountInput = document.getElementById("minCount");
  const targetUrlInput = document.getElementById("targetUrl");

  // ---- HARD SAFETY CHECK ----
  if (!keywordListEl) {
    console.error("keywordList element not found in popup.html");
    return;
  }

  let keywords = [];

  // ---------- Helpers ----------
  function renderKeywords() {
    keywordListEl.innerHTML = "";

    keywords.forEach((word, index) => {
      const row = document.createElement("div");
      row.className = "keyword-row";

      const text = document.createElement("div");
      text.className = "keyword-text";
      text.textContent = word;

      const actions = document.createElement("div");
      actions.className = "keyword-actions";

      // Edit button
      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn";
      editBtn.textContent = "✏️";
      editBtn.title = "Edit";

      editBtn.onclick = () => {
        const newValue = prompt("Edit keyword:", word);
        if (!newValue) return;

        keywords[index] = newValue.trim();
        renderKeywords();
        updatePreview();
      };

      // Delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "icon-btn delete";
      deleteBtn.textContent = "🗑";
      deleteBtn.title = "Delete";

      deleteBtn.onclick = () => {
        keywords.splice(index, 1);
        renderKeywords();
        updatePreview();
      };

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(text);
      row.appendChild(actions);

      keywordListEl.appendChild(row);
    });
  }

  function updatePreview() {
    if (previewText)
      previewText.textContent = keywords.length ? keywords.join(", ") : "—";
    if (previewInterval)
      previewInterval.textContent = intervalInput.value
        ? `${intervalInput.value}s`
        : "—";
  }

  function showStatus(message, isActive = true) {
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.style.display = "block";
    statusEl.style.color = isActive ? "#22c55e" : "#ef4444";
  }

  function setStopButtonVisible(visible) {
    if (!stopAlarmBtn) return;
    stopAlarmBtn.style.display = visible ? "block" : "none";
  }

  // ---------- Load saved state ----------
  async function loadState() {
    const data = await chrome.storage.local.get([
      "keywords",
      "interval",
      "enabled",
      "alarmPlaying",
      "minCount",
      "targetUrl",
    ]);

    keywords = data.keywords || [];

    if (minCountInput) minCountInput.value = data.minCount || 1;
    if (intervalInput) intervalInput.value = data.interval || "";
    if (targetUrlInput) targetUrlInput.value = data.targetUrl || "";
    if (toggleEl) toggleEl.checked = data.enabled || false;

    renderKeywords();
    updatePreview();

    setStopButtonVisible(!!data.alarmPlaying);

    if (toggleEl && toggleEl.checked) {
      showStatus("Monitoring is ON");
    }
  }

  // ---------- Add keyword ----------
  if (addBtn) {
    addBtn.onclick = () => {
      const value = searchInput.value.trim();
      if (!value) return;

      if (keywords.includes(value)) {
        searchInput.value = "";
        return;
      }

      keywords.push(value);
      searchInput.value = "";
      chrome.runtime.sendMessage({ type: "RESTART_MONITOR" });
      renderKeywords();
      updatePreview();
    };
  }

  // ---------- Save settings ----------
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const interval = parseInt(intervalInput.value, 10);

      if (!keywords.length) {
        showStatus("Add at least one keyword", false);
        return;
      }


      if (!interval || interval < 5) {
        showStatus("Interval must be ≥ 5 seconds", false);
        return;
      }

      const minCount = parseInt(minCountInput.value || "1", 10);
      
      const targetUrl = targetUrlInput.value.trim();

      if (!targetUrl.startsWith("http")) {
        showStatus("Enter valid URL", false);
        return;
      }

      

      await chrome.storage.local.set({ keywords, interval, minCount, targetUrl });
      chrome.runtime.sendMessage({ type: "RESTART_MONITOR" });

      updatePreview();

      showStatus("Settings saved");
    };
  }

  // ---------- Toggle monitoring ----------
  if (toggleEl) {
    toggleEl.onchange = async () => {
      const enabled = toggleEl.checked;

      await chrome.storage.local.set({ enabled });

      if (enabled) {
        showStatus("Monitoring started");
        chrome.runtime.sendMessage({ type: "START_MONITOR" });
      } else {
        showStatus("Monitoring stopped", false);
        chrome.runtime.sendMessage({ type: "STOP_MONITOR" });
      }
    };
  }

  // ---------- Stop alarm button ----------
  if (stopAlarmBtn) {
    stopAlarmBtn.onclick = async () => {
      try {
        await chrome.runtime.sendMessage({ type: "STOP_SOUND" });
        await chrome.storage.local.set({ alarmPlaying: false });
        setStopButtonVisible(false);
        showStatus("Alarm stopped", false);
      } catch (e) {
        console.error("Failed to stop alarm:", e);
      }
    };
  }

  // ---------- Listen for alarm state updates ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "ALARM_STARTED") {
      setStopButtonVisible(true);
      showStatus("Alarm ringing", false);
    }

    if (msg.type === "ALARM_STOPPED") {
      setStopButtonVisible(false);
    }
  });

  // ---------- Init ----------
  loadState();

  if (intervalInput) intervalInput.addEventListener("input", updatePreview);
});
