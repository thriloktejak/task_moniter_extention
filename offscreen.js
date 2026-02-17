let audio;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PLAY_SOUND") {
    audio = new Audio(chrome.runtime.getURL("sound.mp3"));
    audio.loop = true;

    audio.play().then(() => {
      chrome.runtime.sendMessage({ type: "ALARM_STARTED" });
      chrome.storage.local.set({ alarmPlaying: true });
    }).catch(err => console.error("Audio failed:", err));
  }

  if (msg.type === "STOP_SOUND") {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio = null;

      chrome.runtime.sendMessage({ type: "ALARM_STOPPED" });
      chrome.storage.local.set({ alarmPlaying: false });
    }
  }
});
