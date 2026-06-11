#!/usr/bin/env bash
# Сборка БД Meridian из CSV. Запуск: bash db/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # корень репозитория
duckdb db/meridian.duckdb < db/load.sql
echo "=== row counts ==="
duckdb db/meridian.duckdb -c "
SELECT 'customers' t, count(*) n FROM customers UNION ALL
SELECT 'product_lines', count(*) FROM product_lines UNION ALL
SELECT 'orders', count(*) FROM orders UNION ALL
SELECT 'nps_responses', count(*) FROM nps_responses UNION ALL
SELECT 'customer_activity_monthly', count(*) FROM customer_activity_monthly UNION ALL
SELECT 'churn_reasons', count(*) FROM churn_reasons UNION ALL
SELECT 'financials_monthly', count(*) FROM financials_monthly UNION ALL
SELECT 'unit_economics_monthly', count(*) FROM unit_economics_monthly
ORDER BY t;"
