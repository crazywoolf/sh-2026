# Meridian — мультиагентный AI-аналитик. Самодостаточный образ: node + duckdb CLI + БД из CSV.
FROM node:22-bookworm-slim

# duckdb CLI (glibc-бинарь) + утилиты для скачивания
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip bash \
 && rm -rf /var/lib/apt/lists/*

ARG DUCKDB_VERSION=v1.5.3
RUN curl -fsSL -o /tmp/duckdb.zip \
      "https://github.com/duckdb/duckdb/releases/download/${DUCKDB_VERSION}/duckdb_cli-linux-amd64.zip" \
 && unzip /tmp/duckdb.zip -d /usr/local/bin \
 && chmod +x /usr/local/bin/duckdb \
 && rm /tmp/duckdb.zip \
 && duckdb --version

WORKDIR /app

# Зависимости (кешируемый слой)
COPY package.json package-lock.json ./
RUN npm ci

# Код + данные
COPY . .

# Сборка БД из CSV на этапе образа → контейнер самодостаточен
RUN bash db/build.sh

ENV PORT=8000
EXPOSE 8000
CMD ["npm", "start"]
