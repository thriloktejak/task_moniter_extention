let audio;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PLAY_SOUND") {
    if (audio) {
    return;
    }
    audio = new Audio(chrome.runtime.getURL("sound.mp3"));
    audio.loop = false;

    audio.play().then(() => {
      chrome.runtime.sendMessage({ type: "ALARM_STARTED" });
    }).catch(err => console.error("Audio failed:", err));

        // ⭐ Detect natural completion
    audio.onended = () => {
      audio = null;
      chrome.runtime.sendMessage({ type: "ALARM_STOPPED" });
    };
  }

  if (msg.type === "STOP_SOUND") {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio = null;

      chrome.runtime.sendMessage({ type: "ALARM_STOPPED" });
    }
  }
});
