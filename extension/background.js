import { isNotebook, NOTEBOOK_HOME, sourceURL, videoURL } from "./core.js";

const menuId = "make-notebook";
const keyFor = (tabId) => `import:${tabId}`;
let queue = Promise.resolve();

function serial(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

async function installMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: menuId,
    title: "Make into NotebookLM",
    contexts: ["page", "selection", "link", "image", "video"],
    documentUrlPatterns: ["*://*.youtube.com/*", "*://youtu.be/*"],
  });
}

async function startImport(input) {
  const url = videoURL(input);
  if (!url) throw new Error("Open a YouTube video first, then try again.");
  const tab = await chrome.tabs.create({ url: "about:blank" });
  const key = keyFor(tab.id);
  const job = { id: crypto.randomUUID(), url, phase: "ready", createdAt: Date.now() };
  await chrome.storage.session.set({ [key]: job });
  try {
    await chrome.tabs.update(tab.id, { url: NOTEBOOK_HOME });
  } catch (error) {
    await chrome.storage.session.remove(key);
    throw error;
  }
  return { tabId: tab.id };
}

async function showError(error, tabId) {
  const message = error.message;
  if (tabId === undefined) return;
  await chrome.action.setBadgeText({ tabId, text: "!" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#a83232" });
  await chrome.action.setTitle({ tabId, title: message });
}

async function currentVideo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function readJob(tabId) {
  const key = keyFor(tabId);
  const values = await chrome.storage.session.get(key);
  const job = values[key];
  if (!job) return null;
  if (Date.now() - job.createdAt > 15 * 60_000) {
    await chrome.storage.session.remove(key);
    return null;
  }
  return job;
}

async function handleJob(message, sender) {
  if (!isNotebook(sender.url) || sender.frameId !== 0) return null;
  const tabId = sender.tab.id;
  const job = await readJob(tabId);
  if (message.type === "get-job") return job;
  if (!job || job.id !== message.id) return null;
  if (message.type === "finish") {
    await chrome.storage.session.remove(keyFor(tabId));
    return true;
  }
  return advanceJob(message, sender, job);
}

async function advanceJob(message, sender, job) {
  const allowed = { ready: "creating", creating: "submitting", submitting: "waiting-summary", "waiting-summary": "summarizing" };
  if (message.type !== "advance") return false;
  if (allowed[job.phase] !== message.phase) return false;
  const notebook = message.phase === "submitting" ? { notebookPath: new URL(sender.url).pathname } : {};
  await chrome.storage.session.set({ [keyFor(sender.tab.id)]: { ...job, ...notebook, phase: message.phase } });
  return true;
}

async function handleMessage(message, sender) {
  if (sender.tab) return handleJob(message, sender);
  if (message.type !== "start") return null;
  return startImport(message.url);
}

chrome.runtime.onInstalled.addListener(() => { installMenu().catch(console.error); });
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== menuId) return;
  serial(() => startImport(sourceURL(info, tab))).catch((error) => showError(error, tab?.id));
});
chrome.commands.onCommand.addListener((command) => {
  if (command !== "make-notebook") return;
  currentVideo().then((tab) => serial(() => startImport(tab?.url))
    .catch((error) => showError(error, tab?.id))).catch(console.error);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  serial(() => handleMessage(message, sender))
    .then((value) => respond({ value })).catch((error) => respond({ error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  serial(() => chrome.storage.session.remove(keyFor(tabId))).catch(console.error);
});
