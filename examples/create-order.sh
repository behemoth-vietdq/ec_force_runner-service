#!/bin/bash

# Example: Create Order
# Usage: ./examples/create-order.sh

echo "Creating order..."
curl -X POST http://localhost:3000/api/orders/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "shop_url": "https://lacluluxyz:zQ9L1X7XgrnJ@laclulu.xyz/admin",
    "credentials": {
      "admin_email": "support@laclulu.xyz",
      "admin_password": "HaKhNezkD6XT"
    },
    "form_data": {
      "customer_id": "597fdf1d3e",
      "product": {
        "name": "Test Product"
      },
      "shipping_address_id": "67890",
      "billing_address": {
        "name01": "太郎",
        "name02": "山田",
        "kana01": "タロウ",
        "kana02": "ヤマダ",
        "zip01": "100",
        "zip02": "0001",
        "addr02": "千代田区千代田1-1-1",
        "tel01": "03",
        "tel02": "1234",
        "tel03": "5678"
      },
      "payment_method_id": "1"
    },
    "options": {
      "screenshot_on_error": true,
      "timeout": 60000
    }
  }' | jq .

echo ""
