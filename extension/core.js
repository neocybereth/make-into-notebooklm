const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

function videoId(url) {
  if (url.hostname === "youtu.be") return url.pathname.slice(1);
  if (url.pathname === "/watch") return url.searchParams.get("v");
  return url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1];
}

export function videoURL(input) {
  try {
    const url = new URL(input);
    if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const id = videoId(url);
    if (!/^[\w-]{11}$/.test(id ?? "")) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  } catch {
    return null;
  }
}

export function sourceURL(info, tab = {}) {
  return videoURL(info.linkUrl) ?? videoURL(info.pageUrl) ?? videoURL(tab.url);
}

export const NOTEBOOK_HOME = "https://notebook.google.com/";
const NOTEBOOK_HOSTS = ["notebook.google.com", "notebooklm.google.com"];

export function isNotebook(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && NOTEBOOK_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}
