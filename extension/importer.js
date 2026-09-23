(() => {
  const TIMEOUT = 45_000;

  async function request(type, fields = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...fields });
    if (response.error) throw new Error(response.error);
    return response.value;
  }

  function visible(element) {
    return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
  }

  function label(element) {
    const accessibleName = element.getAttribute("aria-label");
    if (accessibleName) return accessibleName.trim();
    const copy = element.cloneNode(true);
    copy.querySelectorAll('[aria-hidden="true"], mat-icon, svg').forEach((icon) => icon.remove());
    return copy.textContent.replace(/\s+/g, " ").trim();
  }

  function findButton(pattern, root = document) {
    return [...root.querySelectorAll('button, [role="button"]')]
      .find((element) => pattern.test(label(element)) && visible(element));
  }

  function enabled(element) {
    return element && !element.disabled && element.getAttribute("aria-disabled") !== "true";
  }

  async function waitFor(find, description, timeout = TIMEOUT) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = find();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Couldn’t find ${description}. Complete this step manually in NotebookLM.`);
  }

  function inNotebook() {
    return /\/notebook\/[\w-]+/.test(location.pathname);
  }

  async function advance(job, phase) {
    const accepted = await request("advance", { id: job.id, phase });
    if (!accepted) throw new Error("This import already started. Check this notebook before trying again.");
    job.phase = phase;
    if (phase === "submitting") job.notebookPath = location.pathname;
  }

  async function createNotebook(job) {
    if (job.phase === "ready") {
      const create = await waitFor(() => findButton(/^(?:Create (?:new )?|New )notebook$/i), "New notebook");
      await advance(job, "creating");
      create.click();
    }
    await waitFor(inNotebook, "the new notebook");
  }

  async function openWebsites() {
    const target = await waitFor(() => findButton(/^(?:Websites?|YouTube)$/i)
      || findButton(/^Add sources?$/i), "Add sources");
    target.click();
    if (/^Add sources?$/i.test(label(target))) {
      const websites = await waitFor(() => findButton(/^(?:Websites?|YouTube)$/i), "Websites");
      websites.click();
    }
  }

  function urlField() {
    return [...document.querySelectorAll('textarea, input[type="url"], input[type="text"], input:not([type])')]
      .find((field) => /(?:url|link|website|youtube)/i.test([
        field.getAttribute("aria-label"), field.getAttribute("placeholder"), field.id,
      ].join(" ")) && visible(field));
  }

  function fill(field, url) {
    const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, url);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function submissionRoot(field) {
    return field.closest('[role="dialog"], dialog, mat-dialog-container') || document;
  }

  async function submitSource(job) {
    await openWebsites();
    const field = await waitFor(urlField, "the website URL field");
    if (field.value.trim()) throw new Error("The URL field already contains text. Review it and submit manually.");
    fill(field, job.url);
    const submit = await waitFor(() => {
      const button = findButton(/^(?:Insert|Import|Add|Add source|Add sources)$/i, submissionRoot(field));
      return enabled(button) && button;
    }, "the import button");
    await advance(job, "submitting");
    submit.click();
    await waitFor(() => !field.isConnected || !visible(field), "confirmation that the import dialog closed");
    await advance(job, "waiting-summary");
  }

  function assertNotebook(job) {
    if (location.pathname !== job.notebookPath) {
      throw new Error("The notebook changed. Open the imported notebook and send summarize manually.");
    }
  }

  function readySource() {
    return [...document.querySelectorAll('.single-source-container input[type="checkbox"]:checked')]
      .some((checkbox) => enabled(checkbox) && visible(checkbox));
  }

  function readyChat(job) {
    assertNotebook(job);
    const field = document.querySelector('textarea[aria-label="Query box"]');
    if (!enabled(field) || !visible(field)) return null;
    return readySource() && field;
  }

  function chatSubmit(field) {
    const root = field.closest('.message-container');
    if (!root) return null;
    const button = findButton(/^Submit$/i, root);
    return enabled(button) && button;
  }

  async function summarize(job) {
    const field = await waitFor(() => readyChat(job), "a ready video source and chat box; send summarize when ready", 300_000);
    if (field.value.trim()) throw new Error("Your chat already contains text. Send summarize when you’re ready.");
    fill(field, "summarize");
    const submit = await waitFor(() => {
      assertNotebook(job);
      return readySource() && chatSubmit(field);
    }, "the chat Submit button");
    await advance(job, "summarizing");
    assertNotebook(job);
    if (field.value !== "summarize") throw new Error("Your chat text changed. Submit it manually when you’re ready.");
    submit.click();
    await waitFor(() => !field.value, "confirmation that the summary request was sent");
    await request("finish", { id: job.id });
  }

  async function run() {
    const job = await request("get-job");
    if (!job) return;
    if (["submitting", "summarizing"].includes(job.phase)) {
      return;
    }
    if (job.phase !== "waiting-summary") {
      await createNotebook(job);
      await submitSource(job);
    }
    await summarize(job);
  }

  run().catch(console.error);
})();
