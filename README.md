# Meridian — мультиагентная аналитическая система (AI South Hub 2026)

## Требования

- Node 22+
- DuckDB CLI на PATH (`brew install duckdb` или скачайте бинарь со страницы релизов: https://github.com/duckdb/duckdb/releases)

## Установка и БД

```bash
npm install
bash db/build.sh
```

`db/build.sh` собирает `db/meridian.duckdb` из `data/*.csv`.

## Тесты

```bash
npm test        # все юнит/e2e тесты — детерминированы, без LLM-ключа
npm run typecheck
```

## Запуск (нужен LLM-ключ)

```bash
cp .env.example .env   # заполнить LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
npm start
```

Пример запроса:

```bash
curl -s localhost:8000/api/chat \
  -H 'content-type: application/json' \
  -d '{"message":"покажи выручку по продуктовым линиям"}'
```

## Архитектура

Planner → Extractor → Analyst → Critic (loopback ≤2) → Visualization; контракты в `src/contracts/types.ts`; детали в `docs/superpowers/specs/2026-06-11-stage2-architecture-contracts-design.md`.
