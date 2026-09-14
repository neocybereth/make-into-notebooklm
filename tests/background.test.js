import test from "node:test";
import assert from "node:assert/strict";

let counter = 0;

function event() {
  return { addListener(listener) { this.listener = listener; } };
}

async function worker(t, stored = {}) {
  const tabs = [];
  const menus = [];
  const api = {
    runtime: { onInstalled: event(), onMessage: event() },
    contextMenus: { onClicked: event(), removeAll: async () => {}, create: (menu) => menus.push(menu) },
    commands: { onCommand: event() },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    tabs: {
      create: async (options) => { const tab = { id: tabs.length + 1, ...options }; tabs.push(tab); return tab; },
      update: async (id, options) => Object.assign(tabs.find((tab) => tab.id === id), options),
      query: async () => [{ id: 99, url: "https://youtu.be/abcdefghijk" }],
      onRemoved: event(),
    },
    storage: { session: {
      get: async (key) => ({ [key]: stored[key] }),
      set: async (values) => Object.assign(stored, structuredClone(values)),
      remove: async (key) => { delete stored[key]; },
    } },
  };
  globalThis.chrome = api;
  t.after(() => { delete globalThis.chrome; });
  await import(`../extension/background.js?test=${counter++}`);
  const send = (message, sender = {}) => new Promise((resolve) => api.runtime.onMessage.listener(message, sender, resolve));
  return { api, send, tabs, menus, stored };
}

const sender = { tab: { id: 1 }, frameId: 0, url: "https://notebook.google.com/notebook/test" };

test("popup creates a dedicated tab and persists a normalized job before navigating", async (t) => {
  const { send, stored, tabs } = await worker(t);
  assert.deepEqual(await send({ type: "start", url: "https://youtu.be/abcdefghijk?si=tracking" }), { value: { tabId: 1 } });
  assert.equal(tabs[0].url, "https://notebook.google.com/");
  assert.equal(stored["import:1"].url, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(stored["import:1"].phase, "ready");
});

test("invalid input opens no tab", async (t) => {
  const { send, tabs } = await worker(t);
  assert.match((await send({ type: "start", url: "https://example.com" })).error, /YouTube video/);
  assert.equal(tabs.length, 0);
});

test("concurrent claims advance a job only once and wrong IDs cannot advance it", async (t) => {
  const { send } = await worker(t);
  await send({ type: "start", url: "https://youtu.be/abcdefghijk" });
  const { value: job } = await send({ type: "get-job" }, sender);
  const claim = { type: "advance", id: job.id, phase: "creating" };
  const results = await Promise.all([send(claim, sender), send(claim, sender)]);
  assert.deepEqual(results, [{ value: true }, { value: false }]);
  assert.deepEqual(await send({ type: "advance", id: "wrong", phase: "submitting" }, sender), { value: null });
});

test("foreign pages and child frames cannot read a pending import", async (t) => {
  const { send } = await worker(t);
  await send({ type: "start", url: "https://youtu.be/abcdefghijk" });
  assert.deepEqual(await send({ type: "get-job" }, { ...sender, url: "https://evil.test" }), { value: null });
  assert.deepEqual(await send({ type: "get-job" }, { ...sender, frameId: 2 }), { value: null });
});

test("session storage survives a worker restart and expires old jobs", async (t) => {
  const stored = { "import:1": { id: "saved", phase: "creating", createdAt: Date.now(), url: "https://youtu.be/abcdefghijk" } };
  const { send } = await worker(t, stored);
  assert.equal((await send({ type: "get-job" }, sender)).value.id, "saved");
  stored["import:1"].createdAt -= 16 * 60_000;
  assert.deepEqual(await send({ type: "get-job" }, sender), { value: null });
  assert.equal(stored["import:1"], undefined);
});

test("summary recovery keeps the created notebook path and claims chat submission once", async (t) => {
  const { send, stored } = await worker(t);
  await send({ type: "start", url: "https://youtu.be/abcdefghijk" });
  const { value: job } = await send({ type: "get-job" }, sender);
  await send({ type: "advance", id: job.id, phase: "creating" }, { ...sender, url: "https://notebook.google.com/" });
  await send({ type: "advance", id: job.id, phase: "submitting" }, sender);
  await send({ type: "advance", id: job.id, phase: "waiting-summary" }, sender);
  assert.equal(stored["import:1"].notebookPath, "/notebook/test");
  const claim = { type: "advance", id: job.id, phase: "summarizing" };
  assert.deepEqual(await Promise.all([send(claim, sender), send(claim, sender)]), [{ value: true }, { value: false }]);
});
