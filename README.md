# Make into NotebookLM

A small, local Chrome extension that creates a new NotebookLM notebook from the YouTube video you're watching, opens **Websites**, fills the YouTube URL, and clicks **Insert**. Once the source is ready, it types **summarize** into chat and clicks **Submit**.

## Install once

1. Download this repository using **Code → Download ZIP** and extract it, or clone it with Git.
2. Open `chrome://extensions` in your normal, signed-in Chrome profile.
3. Enable **Developer mode** at the top right.
4. Click **Load unpacked** and select the `extension` folder inside the downloaded repository.
5. Optionally pin **Make into NotebookLM** using Chrome's puzzle-piece menu.

No build command, API key, payment, or separate account is required. Keep the extension folder in place. When the code changes, click its reload button on `chrome://extensions`.

## Use

- On a YouTube video page, right-click the page and choose **Make into NotebookLM**. Right-clicking another YouTube video link imports that linked video instead.
- Or click the toolbar icon and choose **Make into NotebookLM** in the popup.
- Or press **Option + N** on Mac (**Alt + Shift + N** elsewhere). If another extension already owns the shortcut, assign one at `chrome://extensions/shortcuts`.

YouTube's video player has its own right-click menu. Right-click outside the player, or right-click the player a second time to reveal Chrome's menu. Chrome does not expose the address-bar context menu to extensions.

Each action creates a **new notebook**. Regular videos, Shorts, live-video URLs, embeds and `youtu.be` links are accepted; playlists and channel pages are not. Timestamps and tracking parameters are removed.

## What happens

```text
YouTube → right-click / toolbar / shortcut
        → new NotebookLM tab
        → Create new notebook → Websites → paste URL → Insert
        → wait for source processing → type summarize → chat Submit
```

The extension uses your signed-in Chrome profile and NotebookLM's normal web interface. It supports `notebook.google.com` and `notebooklm.google.com`. The current UI calls the product Gemini Notebook; the extension keeps the requested NotebookLM name.

Google processes the video after submission. Public videos with available transcripts are supported; private videos, missing captions, recent uploads, and source/account limits can prevent import. The extension waits up to five minutes for a selected, usable source and the chat box, then submits **summarize**. It leaves existing chat drafts alone. If processing takes longer, send **summarize** manually when the source is ready. See [Google's source-import help](https://support.google.com/gemininotebook/answer/16215270).

The automation runs without an on-page toast and currently targets **English** NotebookLM controls. If Google changes them, it stops and logs the error in the browser console. It never automatically retries source or chat submission after an uncertain result or reload. A reload while waiting for processing resumes the summary step only in the same notebook. Jobs expire after 15 minutes and are forgotten on browser restart. After signing in, returning to the same pending tab within 15 minutes resumes the flow; otherwise invoke the extension again.

## Permissions and privacy

- `activeTab`: reads the current video URL and title when you invoke the extension.
- `contextMenus`: adds the YouTube page menu item.
- `storage`: keeps pending imports in Chrome's session-only extension storage.
- Content-script access to the two NotebookLM domains: fills and submits the source dialog, only for a tab with a pending import created by the extension.

No analytics, third-party servers, cookies API, remote scripts, or API credentials. The selected YouTube URL and the word **summarize** are submitted to Google. Nothing is injected into ordinary YouTube pages. The context-menu item is restricted to YouTube pages.

## Development and verification

```sh
npm ci
npm run check
```

The extension itself has no runtime npm dependencies. ESLint enforces cyclomatic complexity **8** without exceptions. Node/JSDOM tests exercise URL validation and the actual importer script, including hidden Material icon text from the observed Google interface, new-notebook creation, input events, submission, reload recovery, and preserving user-entered text.

Before declaring a release verified, load it in Chrome, import one public captioned YouTube video, and confirm the video appears in **Sources** followed by one **summarize** message in chat. Repeat with the toolbar action and shortcut as needed. If a control changes, update the narrowly scoped selectors in `extension/importer.js` and its regression fixture. Disable the extension in Chrome to stop future runs.
