import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLLMConfig, folderFromModel } from "./client.ts";

test("дефолт: Bearer-схема (без кастомного заголовка)", () => {
  const c = resolveLLMConfig({ LLM_API_KEY: "k1" } as NodeJS.ProcessEnv);
  assert.equal(c.apiKey, "k1");
  assert.equal(c.defaultHeaders, undefined);
  assert.equal(c.defaultModel, "gpt-4o-mini");
});

test("folderFromModel: извлекает каталог из URI Yandex", () => {
  assert.equal(folderFromModel("gpt://b1abc/yandexgpt-5.1"), "b1abc");
  assert.equal(folderFromModel("gpt-4o-mini"), undefined);
});

test("Yandex: project берётся из URI модели, base URL прокинут", () => {
  const c = resolveLLMConfig({
    LLM_API_KEY: "yk",
    LLM_BASE_URL: "https://ai.api.cloud.yandex.net/v1",
    LLM_MODEL: "gpt://folder123/yandexgpt-5.1",
  } as NodeJS.ProcessEnv);
  assert.equal(c.project, "folder123");
  assert.equal(c.baseURL, "https://ai.api.cloud.yandex.net/v1");
  assert.equal(c.defaultHeaders, undefined); // дефолт Bearer
});

test("LLM_PROJECT переопределяет folder из модели; api-key схема включается", () => {
  const c = resolveLLMConfig({
    LLM_API_KEY: "yk",
    LLM_MODEL: "gpt://fromuri/yandexgpt-5.1",
    LLM_PROJECT: "explicit",
    LLM_AUTH: "api-key",
  } as NodeJS.ProcessEnv);
  assert.equal(c.project, "explicit");
  assert.equal(c.defaultHeaders?.Authorization, "Api-Key yk");
});
