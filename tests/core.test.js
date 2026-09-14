import test from "node:test";
import assert from "node:assert/strict";
import { videoURL, sourceURL } from "../extension/core.js";

test("normalizes watch, short, live, embed and shared YouTube links", () => {
  for (const input of [
    "https://www.youtube.com/watch?v=abcdefghijk&t=10&list=other",
    "https://youtu.be/abcdefghijk?si=tracking",
    "https://m.youtube.com/shorts/abcdefghijk",
    "https://youtube.com/live/abcdefghijk",
    "https://www.youtube.com/embed/abcdefghijk",
  ]) assert.equal(videoURL(input), "https://www.youtube.com/watch?v=abcdefghijk");
});

test("rejects non-videos, malformed IDs and lookalike hosts", () => {
  for (const input of [undefined, "", "garbage", "https://youtube.com/",
    "https://youtube.com/playlist?list=abc", "https://youtube.com/watch?v=abc",
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://evil.test/abcdefghijk", "javascript:alert(1)",
    "https://youtu.be/abcdefghijk/extra",
  ]) assert.equal(videoURL(input), null);
});

test("a right-clicked video link wins over the video currently playing", () => {
  assert.equal(sourceURL({ linkUrl: "https://youtu.be/12345678901", pageUrl: "https://youtu.be/abcdefghijk" }),
    "https://www.youtube.com/watch?v=12345678901");
  assert.equal(sourceURL({ linkUrl: "https://example.com", pageUrl: "https://youtu.be/abcdefghijk" }),
    "https://www.youtube.com/watch?v=abcdefghijk");
});
