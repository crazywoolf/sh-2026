import { test } from "node:test";
import assert from "node:assert/strict";
import { ping } from "./sanity.ts";

test("ping returns pong", () => {
  assert.equal(ping(), "pong");
});
