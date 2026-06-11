# Деплой Meridian на ВМ team-004

Развёрнуто: **https://team-004.aisouthhack.ru** (прокси оргов → :8000).

## Архитектура деплоя
- **Docker-контейнер** (`Dockerfile` в корне): node:22-slim + duckdb CLI 1.5.3 + БД, собранная из CSV на этапе build → образ самодостаточен.
- HTTPS обеспечивает внешний прокси оргов; TLS на ВМ не настраивается.
- LLM: YandexGPT через OpenAI-совместимый endpoint. Ключи берутся на ВМ из `/opt/hackathon/ai.env` (`YC_API_KEY`, `YC_FOLDER_ID`) и мапятся на `LLM_*` при `docker run` — **в образ и в git не зашиваются**.
- Контейнер `--restart unless-stopped`; `hackathon-portal.service` остановлен и disabled (чтобы не занимал :8000 после ребута).

## Маппинг окружения (ВМ → приложение)
| ai.env | приложение |
|---|---|
| `YC_API_KEY` | `LLM_API_KEY` |
| `YC_FOLDER_ID` | в `LLM_MODEL=gpt://<folder>/yandexgpt-5.1` |
| — | `LLM_BASE_URL=https://ai.api.cloud.yandex.net/v1`, `LLM_AUTH=bearer` |

Telegram на проде выключен (отчёты только в инбокс).

## Первичный деплой (выполнено)
```bash
# с Mac: доставка кода
rsync -az --exclude node_modules --exclude .git --exclude .env \
  --exclude 'db/meridian.duckdb' -e ssh ./ team-004@<vm>:app/
# на ВМ:
cd ~/app && docker build -t meridian .
set -a; . /opt/hackathon/ai.env 2>/dev/null || eval "$(sudo -n cat /opt/hackathon/ai.env)"; set +a
sudo systemctl stop hackathon-portal.service
docker run -d --name meridian --restart unless-stopped -p 8000:8000 \
  -e LLM_BASE_URL=https://ai.api.cloud.yandex.net/v1 -e LLM_API_KEY="$YC_API_KEY" \
  -e LLM_MODEL="gpt://$YC_FOLDER_ID/yandexgpt-5.1" -e LLM_AUTH=bearer meridian
```

## Передеплой после изменений кода
```bash
# с Mac: rsync обновлённого кода → team-004@<vm>:app/
# на ВМ:
cd ~/app && docker build -t meridian .
set -a; . /opt/hackathon/ai.env 2>/dev/null || eval "$(sudo -n cat /opt/hackathon/ai.env)"; set +a
docker rm -f meridian && docker run -d --name meridian --restart unless-stopped -p 8000:8000 \
  -e LLM_BASE_URL=https://ai.api.cloud.yandex.net/v1 -e LLM_API_KEY="$YC_API_KEY" \
  -e LLM_MODEL="gpt://$YC_FOLDER_ID/yandexgpt-5.1" -e LLM_AUTH=bearer meridian
```
(копия раннбука лежит на ВМ: `~/app/REDEPLOY.md`)

## Проверка
```bash
curl -s https://team-004.aisouthhack.ru/health
curl -s https://team-004.aisouthhack.ru/api/chat -H 'content-type: application/json' \
  -d '{"message":"какая выручка по продуктовым линиям?"}'
```

## Откат на личный кабинет
```bash
docker rm -f meridian && sudo systemctl start hackathon-portal.service
```

## Проверено вживую (2026-06-11)
- `GET /health` → 200; `GET /` → UI («Диалоговый BI»).
- `POST /api/chat` (LTV/CAC по сегментам) → 200, ~7с, корректный ответ + bar-chart.
- Ловушка (прогноз 2027) → `insufficient_data: true` (честный отказ).
