#!/bin/bash

echo "Checking if fact_transactions has data..."

while true; do
  COUNT=$(psql "postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$POSTGRES_HOST/$POSTGRES_DB" \
    -t -c "SELECT COUNT(*) FROM fact_transactions;" 2>/dev/null | tr -d ' ')
    
  if [ "$COUNT" -gt "0" ] 2>/dev/null; then
    echo "fact_transactions has $COUNT rows, starting simulator..."
    break
  fi

  echo "fact_transactions is empty, retrying in 30 seconds..."
  sleep 30
done

exec python /app/src/simulator/simulator.py