import { videoURL } from "./core.js";

const button = document.querySelector("#make");
const status = document.querySelector("#status");
let selectedURL;

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  selectedURL = videoURL(tab?.url);
  if (!selectedURL) {
    document.querySelector("#title").textContent = "Open a YouTube video to get started.";
    return;
  }
  document.querySelector("#title").textContent = tab.title.replace(/ - YouTube$/, "");
  document.querySelector("#url").textContent = selectedURL;
  button.disabled = false;
  const [, commands] = await Promise.all([
    chrome.action.setBadgeText({ tabId: tab.id, text: "" }),
    chrome.commands.getAll(),
  ]);
  const shortcut = commands.find((item) => item.name === "make-notebook")?.shortcut;
  document.querySelector("#shortcut").textContent = shortcut
    ? `Shortcut: ${shortcut}` : "Set a shortcut at chrome://extensions/shortcuts";
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Opening your notebook…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "start", url: selectedURL });
    if (result.error) throw new Error(result.error);
    window.close();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});
initialize().catch((error) => { status.textContent = error.message; });
