#!/usr/bin/env bash
# Run once after first `docker compose up -d garage`
# Creates the layout, bucket, and access key for hw5c4n images

set -euo pipefail

COMPOSE="docker compose -f $(dirname "$0")/docker-compose.yml"
GARAGE="$COMPOSE exec garage /garage"

echo "=== Garage node status ==="
$GARAGE status

# Assign layout — single node, full capacity
NODE_ID=$($GARAGE status 2>&1 | grep -oP '[0-9a-f]{16}' | head -1)
echo "Assigning layout to node $NODE_ID ..."
$GARAGE layout assign -z dc1 -c 2T "$NODE_ID"
$GARAGE layout apply --version 1

echo "=== Creating bucket: hw5c4n-images ==="
$GARAGE bucket create hw5c4n-images

echo "=== Creating API key ==="
$GARAGE key create hw5c4n-app

echo "=== Granting read+write on bucket ==="
$GARAGE bucket allow --read --write hw5c4n-images --key hw5c4n-app

echo ""
echo "=== Key info (save these) ==="
$GARAGE key info hw5c4n-app
