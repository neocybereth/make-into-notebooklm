import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const script = await readFile(new URL("../extension/importer.js", import.meta.url), "utf8");
const url = "https://www.youtube.com/watch?v=abcdefghijk";

function fixture(t, phase = "ready", createLabel = "Create new notebook") {
  const dom = new JSDOM(`<button aria-label="${createLabel}"><mat-icon aria-hidden="true">add_2</mat-icon>${createLabel}</button>`, {
    url: "https://notebook.google.com/", runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.HTMLElement.prototype.getClientRects = function () {
    return this.hidden ? [] : [{}];
  };
  const job = { id: "job-one", url, phase, notebookPath: "/notebook/new-test" };
  const state = { creates: 0, submissions: [], prompts: [], messages: [], job, completed: false };
  window.chrome = { runtime: { sendMessage: async (message) => {
    state.messages.push(message);
    if (message.type === "get-job") return { value: structuredClone(state.job) };
    if (message.type === "advance") {
      const next = { ready: "creating", creating: "submitting", submitting: "waiting-summary", "waiting-summary": "summarizing" };
      const accepted = next[state.job.phase] === message.phase;
      if (accepted) state.job.phase = message.phase;
      return { value: accepted };
    }
    state.completed = true;
    return { value: true };
  } } };
  return { window, state, start: () => window.eval(script) };
}

function websites(window, state, initialValue = "") {
  window.document.body.innerHTML = '<button><mat-icon aria-hidden="true">link</mat-icon><mat-icon aria-hidden="true">video_youtube</mat-icon><span>Websites</span></button>';
  window.document.querySelector("button").onclick = () => {
    window.document.body.innerHTML = '<div role="dialog"><textarea placeholder="Paste URLs here"></textarea><button disabled>Insert</button></div><button>Submit</button>';
    const field = window.document.querySelector("textarea");
    const button = window.document.querySelector("button");
    field.value = initialValue;
    field.oninput = () => { button.disabled = !field.value; };
    button.onclick = () => {
      state.submissions.push(field.value);
      window.document.querySelector('[role="dialog"]').remove();
      chat(window, state);
    };
  };
}

function chat(window, state, ready = true, draft = "") {
  window.document.body.innerHTML = '<button aria-label="Submit" id="source-search">Search</button><div class="single-source-container"><input type="checkbox" aria-label="Select imported video"></div><div class="message-container"><textarea aria-label="Query box"></textarea><span class="selected-num">1 source</span><button aria-label="Submit" disabled>Send</button></div>';
  const checkbox = window.document.querySelector('input');
  checkbox.checked = ready;
  checkbox.disabled = !ready;
  const field = window.document.querySelector('textarea');
  const button = window.document.querySelector('.message-container button');
  field.value = draft;
  field.oninput = () => { button.disabled = !field.value; };
  button.onclick = () => { state.prompts.push(field.value); field.value = ""; };
  window.document.querySelector('#source-search').onclick = () => assert.fail("Clicked source search instead of chat submit");
}

async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Importer did not reach expected state");
}

for (const createLabel of ["New notebook", "Create notebook", "Create new notebook"]) {
  test(`creates via ${createLabel}, imports the video and summarizes exactly once`, async (t) => {
    const { window, state, start } = fixture(t, "ready", createLabel);
    window.document.querySelector("button").onclick = () => {
      state.creates++;
      window.history.pushState({}, "", "/notebook/new-test?addSource=true");
      websites(window, state);
    };
    start();
    await until(() => state.completed);
    assert.equal(state.creates, 1);
    assert.deepEqual(state.submissions, [url]);
    assert.deepEqual(state.prompts, ["summarize"]);
    assert.deepEqual(state.messages.map((message) => message.type), ["get-job", "advance", "advance", "advance", "advance", "finish"]);
  });
}

test("resumes after notebook navigation without creating another notebook", async (t) => {
  const { window, state, start } = fixture(t, "creating");
  window.history.replaceState({}, "", "/notebook/new-test");
  window.document.body.innerHTML = '<button aria-label="Add source">add</button>';
  window.document.querySelector("button").onclick = () => websites(window, state);
  start();
  await until(() => state.completed);
  assert.equal(state.creates, 0);
  assert.deepEqual(state.submissions, [url]);
});

test("never resubmits after a reload during submission", async (t) => {
  const { state, start } = fixture(t, "submitting");
  start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(state.submissions, []);
  assert.deepEqual(state.messages.map((message) => message.type), ["get-job"]);
});

test("does not overwrite a URL the user already entered", async (t) => {
  const { window, state, start } = fixture(t, "creating");
  window.history.replaceState({}, "", "/notebook/new-test");
  websites(window, state, "https://example.com/my-source");
  start();
  await until(() => window.document.querySelector("textarea"));
  assert.equal(window.document.querySelector("textarea").value, "https://example.com/my-source");
  assert.deepEqual(state.submissions, []);
});

test("ordinary NotebookLM tabs with no pending job are untouched", async (t) => {
  const { window, state, start } = fixture(t);
  state.job = null;
  start();
  await until(() => state.messages.length > 0);
  assert.equal(window.document.querySelector("#make-notebook-status"), null);
  assert.equal(state.creates, 0);
});

test("waits for a processed source before sending summarize", async (t) => {
  const { window, state, start } = fixture(t, "waiting-summary");
  window.history.replaceState({}, "", "/notebook/new-test");
  chat(window, state, false);
  start();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(window.document.querySelector('textarea').value, "");
  assert.deepEqual(state.prompts, []);
  const checkbox = window.document.querySelector('input');
  checkbox.disabled = false;
  checkbox.checked = true;
  await until(() => state.completed);
  assert.deepEqual(state.prompts, ["summarize"]);
});

test("a chat draft is never replaced or submitted", async (t) => {
  const { window, state, start } = fixture(t, "waiting-summary");
  window.history.replaceState({}, "", "/notebook/new-test");
  chat(window, state, true, "My unfinished question");
  start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(window.document.querySelector('textarea').value, "My unfinished question");
  assert.deepEqual(state.prompts, []);
});

test("reload after claiming summary submission never sends it again", async (t) => {
  const { window, state, start } = fixture(t, "summarizing");
  window.history.replaceState({}, "", "/notebook/new-test");
  chat(window, state);
  start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(state.prompts, []);
  assert.equal(state.completed, false);
});

test("resuming in a different notebook does not send summarize", async (t) => {
  const { window, state, start } = fixture(t, "waiting-summary");
  window.history.replaceState({}, "", "/notebook/someone-else");
  chat(window, state);
  start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(state.prompts, []);
});
