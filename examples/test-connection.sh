#!/bin/bash

# Test Connection
curl -X POST http://localhost:3000/api/orders/test-connection \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "shop_url": "https://admin.ecforce.example.com",
    "credentials": {
      "admin_email": "admin@example.com",
      "admin_password": "password123"
    }
  }'
