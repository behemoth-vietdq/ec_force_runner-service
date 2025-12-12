#!/bin/bash

# Health check script for monitoring

BASE_URL="${1:-http://localhost:3000}"

echo "🏥 Health Check: $BASE_URL"
echo ""

# Function to check endpoint
check_endpoint() {
    local endpoint=$1
    local name=$2
    
    echo -n "Checking $name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint" 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        echo "✅ OK"
        return 0
    else
        echo "❌ Failed (HTTP $response)"
        return 1
    fi
}

# Check endpoints
all_ok=true

check_endpoint "/health" "Health" || all_ok=false
check_endpoint "/health/status" "Status" || all_ok=false
check_endpoint "/health/ready" "Readiness" || all_ok=false
check_endpoint "/health/live" "Liveness" || all_ok=false

echo ""

if [ "$all_ok" = true ]; then
    echo "✅ All health checks passed"
    exit 0
else
    echo "❌ Some health checks failed"
    exit 1
fi
