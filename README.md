# Line Shop Runner Service

A robust Node.js service for automating order creation on EC-Force platform using Puppeteer. This service provides a RESTful API to create orders programmatically through browser automation.

## 🚀 Features

- **Browser Automation**: Powered by Puppeteer for reliable web automation
- **RESTful API**: Simple and intuitive API endpoints
- **Error Handling**: Comprehensive error handling with automatic screenshots
- **Retry Logic**: Automatic retries for failed operations
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Logging**: Detailed logging with Winston
- **Docker Support**: Easy deployment with Docker
- **Health Checks**: Kubernetes-ready health check endpoints
- **API Authentication**: Simple API key authentication
- **Validation**: Request validation with Joi

## 📋 Requirements

- Node.js >= 18.0.0
- npm or yarn
- Chrome/Chromium (automatically installed by Puppeteer)

## 🛠️ Installation

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd line-shop-runner-service
```

2. Install dependencies:
```bash
npm install
# or
make install
```

3. Copy environment file:
```bash
cp .env.example .env
```

4. Edit `.env` file with your configuration:
```bash
# Set your API key
API_KEY=your-secure-api-key-here

# Configure other settings as needed
HEADLESS=true
LOG_LEVEL=info
```

5. Start the service:
```bash
npm start
# or for development with auto-reload
npm run dev
# or using Makefile
make dev
```

### Docker Deployment

1. Build Docker image:
```bash
docker build -t line-shop-runner-service:latest .
# or
make docker-build
```

2. Run with Docker Compose:
```bash
docker-compose up -d
# or
make docker-up
```

3. View logs:
```bash
docker-compose logs -f
# or
make docker-logs
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000
```

### Authentication

All API endpoints (except health checks) require an API key. Include it in the request header:

```
X-API-Key: your-api-key-here
```

Or as a query parameter:
```
?api_key=your-api-key-here
```

### Endpoints

#### 1. Health Check

**GET** `/health`

Check if the service is running.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-14T10:00:00.000Z",
  "uptime": {
    "seconds": 3600,
    "formatted": "1h 0m 0s"
  },
  "memory": {
    "rss": "150MB",
    "heapTotal": "50MB",
    "heapUsed": "30MB"
  }
}
```

#### 2. Create Order

**POST** `/api/orders/create`

Create a new order on EC-Force platform.

**Headers:**
```
Content-Type: application/json
X-API-Key: your-api-key-here
```

**Request Body:**
```json
{
  "shop_url": "https://admin.ecforce.example.com",
  "credentials": {
    "admin_email": "admin@example.com",
    "admin_password": "password123"
  },
  "form_data": {
    "customer_id": "12345",
    "product": {
      "name": "Product Name"
    },
    "shipping_address_id": "67890",
    "billing_address": {
      "name01": "太郎",
      "name02": "山田",
      "kana01": "タロウ",
      "kana02": "ヤマダ",
      "zip01": "100",
      "zip02": "0001",
      "addr02": "千代田区1-1-1",
      "tel01": "03",
      "tel02": "1234",
      "tel03": "5678"
    },
    "payment_method_id": "1"
  },
  "options": {
    "headless": true,
    "screenshot_on_error": true,
    "timeout": 60000
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "request_id": "req_1699960800000_abc123",
  "data": {
    "order_number": "ORD-20251114-001",
    "customer_number": "CUST-12345",
    "total": "¥10,000",
    "created_at": "2025-11-14T10:00:00.000Z"
  },
  "execution_time_ms": 15320
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": {
    "code": "ELEMENT_NOT_FOUND",
    "message": "Element not found: #add_order_item",
    "details": {
      "selector": "#add_order_item",
      "originalError": "Timeout waiting for selector"
    }
  }
}
```

#### 3. Test Connection

**POST** `/api/orders/test-connection`

Test connection and validate credentials.

**Request Body:**
```json
{
  "shop_url": "https://admin.ecforce.example.com",
  "credentials": {
    "admin_email": "admin@example.com",
    "admin_password": "password123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "request_id": "test_1699960800000",
  "message": "Connection successful. Credentials are valid.",
  "shop_url": "https://admin.ecforce.example.com"
}
```

#### 4. Get Order Status

**GET** `/api/orders/status/:requestId`

Get the status of an order creation request.

**Response:**
```json
{
  "success": true,
  "request_id": "req_1699960800000_abc123",
  "status": "completed",
  "message": "Status tracking not yet implemented. Use synchronous API for now."
}
```

## 🔧 Configuration

Configuration is managed through environment variables. See `.env.example` for all available options.

### Key Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 3000 |
| `HEADLESS` | Run browser in headless mode | true |
| `API_KEY` | API authentication key | - |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | info |
| `SCREENSHOT_ON_ERROR` | Take screenshots on errors | true |
| `MAX_RETRIES` | Maximum retry attempts | 3 |
| `DEFAULT_TIMEOUT` | Default timeout in ms | 60000 |

## 📁 Project Structure

```
line-shop-runner-service/
├── src/
│   ├── app.js                          # Application entry point
│   ├── config/
│   │   └── index.js                    # Configuration loader
│   ├── controllers/
│   │   ├── orderController.js          # Order creation logic
│   │   └── healthController.js         # Health check endpoints
│   ├── services/
│   │   └── crawler/
│   │       ├── BaseCrawler.js          # Base crawler class
│   │       └── EcForceOrderCrawler.js  # EC-Force implementation
│   ├── middleware/
│   │   ├── errorHandler.js             # Error handling
│   │   ├── validateRequest.js          # Request validation
│   │   ├── requestLogger.js            # Request logging
│   │   └── auth.js                     # API authentication
│   ├── utils/
│   │   ├── logger.js                   # Winston logger
│   │   └── screenshot.js               # Screenshot utilities
│   └── routes/
│       └── index.js                    # Route definitions
├── logs/                               # Application logs
├── screenshots/                        # Debug screenshots
├── .env.example                        # Environment template
├── .gitignore
├── package.json
├── Dockerfile
├── docker-compose.yml
├── Makefile
└── README.md
```

## 🧪 Testing

### Run Tests
```bash
npm test
# or
make test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
# or
make test-watch
```

### Lint Code
```bash
npm run lint
# or
make lint
```

### Fix Lint Errors
```bash
npm run lint:fix
# or
make lint-fix
```

## 📊 Logging

Logs are written to:
- Console (development mode)
- `logs/app.log` (all logs)
- `logs/error.log` (errors only)

Log levels: `error`, `warn`, `info`, `debug`

## 📸 Screenshots

Screenshots are automatically captured:
- On errors (when `SCREENSHOT_ON_ERROR=true`)
- At key steps (when `DEBUG_MODE=true`)

Screenshots are saved in the `screenshots/` directory with timestamps.

Old screenshots are automatically cleaned up after 7 days.

## 🔒 Security

- API key authentication
- Rate limiting
- Helmet.js for security headers
- Input validation with Joi
- CORS configuration
- No sensitive data in logs

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `API_KEY`
- [ ] Enable `HEADLESS=true`
- [ ] Configure proper `LOG_LEVEL`
- [ ] Set up log rotation
- [ ] Configure rate limiting
- [ ] Set up monitoring/alerts
- [ ] Configure proper CORS origins
- [ ] Use HTTPS in production
- [ ] Regular screenshot cleanup

### Docker Production Deployment

```bash
# Build production image
docker build -t line-shop-runner-service:latest .

# Run with environment variables
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e API_KEY=your-secure-key \
  -e HEADLESS=true \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/screenshots:/app/screenshots \
  --name line-shop-runner \
  line-shop-runner-service:latest
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: line-shop-runner
spec:
  replicas: 2
  selector:
    matchLabels:
      app: line-shop-runner
  template:
    metadata:
      labels:
        app: line-shop-runner
    spec:
      containers:
      - name: line-shop-runner
        image: line-shop-runner-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: line-shop-secrets
              key: api-key
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

## 🐛 Troubleshooting

### Browser fails to launch

**Problem:** Puppeteer cannot launch Chrome/Chromium

**Solutions:**
- Install required dependencies (see Dockerfile)
- Check if running as root (not recommended)
- Verify `PUPPETEER_EXECUTABLE_PATH` if using custom Chrome

### Login fails

**Problem:** Cannot login to EC-Force admin

**Solutions:**
- Verify credentials are correct
- Check if shop URL is accessible
- Review screenshot in `screenshots/` directory
- Enable debug mode: `DEBUG_MODE=true`

### Element not found errors

**Problem:** Crawler cannot find page elements

**Solutions:**
- EC-Force may have updated their UI
- Check screenshots to see actual page state
- Update selectors in `EcForceOrderCrawler.js`
- Increase timeout: `DEFAULT_TIMEOUT=120000`

### Memory issues

**Problem:** Service runs out of memory

**Solutions:**
- Ensure browsers are properly closed
- Reduce `MAX_CONCURRENT_REQUESTS`
- Increase container memory limits
- Check for memory leaks in logs

## 📈 Monitoring

### Health Check Endpoints

- `/health` - Basic health check
- `/health/status` - Detailed status
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe

### Metrics to Monitor

- Response time
- Success/failure rate
- Browser instances
- Memory usage
- Error rate by type
- Queue length (future)

## 🔄 Future Enhancements

- [ ] Queue system with Redis/Bull
- [ ] Database for order history
- [ ] Webhook notifications
- [ ] Multi-platform support (not just EC-Force)
- [ ] Web dashboard for monitoring
- [ ] Batch order processing
- [ ] Caching layer
- [ ] Prometheus metrics
- [ ] OpenAPI/Swagger documentation
- [ ] Unit and integration tests

## 📝 License

MIT

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please create an issue in the repository.

---

**Built with ❤️ using Node.js and Puppeteer**
