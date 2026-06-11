-- Загрузка витрины Meridian из CSV в DuckDB. Идемпотентно (CREATE OR REPLACE).
-- Запускать из корня репозитория: duckdb db/meridian.duckdb < db/load.sql

CREATE OR REPLACE TABLE customers AS
SELECT * FROM read_csv_auto('data/customers.csv', header=true,
  types={'customer_id':'INTEGER','signup_date':'DATE','churn_date':'DATE'});

CREATE OR REPLACE TABLE product_lines AS
SELECT * FROM read_csv_auto('data/product_lines.csv', header=true,
  types={'product_line_id':'INTEGER','launch_date':'DATE'});

CREATE OR REPLACE TABLE orders AS
SELECT * FROM read_csv_auto('data/orders.csv', header=true,
  types={'order_id':'BIGINT','customer_id':'INTEGER','product_line_id':'INTEGER','order_date':'DATE'});

CREATE OR REPLACE TABLE nps_responses AS
SELECT * FROM read_csv_auto('data/nps_responses.csv', header=true,
  types={'response_id':'BIGINT','customer_id':'INTEGER','product_line_id':'INTEGER','response_date':'DATE'});

CREATE OR REPLACE TABLE customer_activity_monthly AS
SELECT * FROM read_csv_auto('data/customer_activity_monthly.csv', header=true,
  types={'customer_id':'INTEGER','month':'DATE'});

CREATE OR REPLACE TABLE churn_reasons AS
SELECT * FROM read_csv_auto('data/churn_reasons.csv', header=true,
  types={'customer_id':'INTEGER','churn_date':'DATE','interview_completed':'BOOLEAN'});

CREATE OR REPLACE TABLE financials_monthly AS
SELECT * FROM read_csv_auto('data/financials_monthly.csv', header=true,
  types={'month':'DATE'});

CREATE OR REPLACE TABLE unit_economics_monthly AS
SELECT * FROM read_csv_auto('data/unit_economics_monthly.csv', header=true,
  types={'month':'DATE','product_line_id':'INTEGER'});
