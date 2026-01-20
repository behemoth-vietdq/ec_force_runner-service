# Line Shop Runner Service

Production-ready Node.js service for automating EC-Force order creation using Puppeteer. Designed for Kubernetes deployment with horizontal scaling, comprehensive monitoring, and enterprise-grade security.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Requirements](#-requirements)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [API Documentation](#-api-documentation)
- [Deployment](#-deployment)
- [Monitoring](#-monitoring)
- [Security](#-security)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## 🚀 Features

### Core Features
- **Browser Automation**: Powered by Puppeteer for reliable web automation
- **RESTful API**: Simple and intuitive API endpoints
- **Error Handling**: Comprehensive error handling with automatic screenshots
- **Retry Logic**: Exponential backoff for failed operations
- **Logging**: Structured JSON logging with Winston and async context tracking

### Production Features
- **📊 Prometheus Metrics**: Comprehensive metrics for monitoring and alerting
- **☸️ Kubernetes Ready**: HPA-compatible with proper health checks (liveness, readiness, startup)
- **🔒 Security**: API key authentication, rate limiting, input sanitization, Helmet, CORS
- **📸 GCS Integration**: Screenshot upload to Google Cloud Storage with signed URLs
- **🏥 Health Checks**: `/healthz`, `/ready`, `/live` endpoints
- **🐳 Docker Support**: Multi-stage build with security best practices
- **📱 LINE Messaging**: Automatic order notifications via LINE Messaging API

### Observability & Monitoring
- HTTP request metrics (duration, count, in-progress)
- Crawler metrics (execution time, errors, step timing)
- Business metrics (orders created/failed by shop)
- GCS upload metrics (duration, success rate)
- Default Node.js metrics (CPU, memory, event loop)

## 🏗️ Architecture

```
line-shop-runner-service/
├── src/
│   ├── app.js                          # Application entry point
│   ├── config/
│   │   ├── index.js                    # Configuration loader
│   │   ├── constants.js                # Application constants
│   │   └── validation.js               # Config validation with Joi
│   ├── controllers/
│   │   ├── orderController.js          # Order creation logic
│   │   └── healthController.js         # Health check endpoints
│   ├── services/
│   │   ├── crawler/
│   │   │   ├── BaseCrawler.js          # Base crawler class
│   │   │   └── EcForceOrderCrawler.js  # EC-Force implementation
│   │   ├── ecforce/
│   │   │   ├── BaseService.js          # EC-Force API base service
│   │   │   ├── EcForceAdmin.js         # EC-Force admin client
│   │   │   ├── GetOrderService.js      # Get order details
│   │   │   └── GetCustomersService.js  # Get customers
│   │   ├── line/
│   │   │   ├── LineMessageService.js   # LINE API client
│   │   │   ├── sendMessage.js          # Message sending helpers
│   │   │   └── templates.js            # Message templates
│   │   └── order/
│   │       ├── OrderLoggerService.js   # Order logging
│   │       └── OrderNotificationService.js # Notifications
│   ├── middleware/
│   │   ├── auth.js                     # API key authentication
│   │   ├── errorHandler.js             # Error handling
│   │   ├── orderValidation.js          # Request validation
│   │   ├── requestId.js                # Request ID tracking
│   │   └── requestLogger.js            # Request logging
│   ├── utils/
│   │   ├── asyncContext.js             # Async context tracking
│   │   ├── logger.js                   # Winston logger
│   │   ├── metrics.js                  # Prometheus metrics
│   │   ├── retry.js                    # Retry with backoff
│   │   ├── sanitizer.js                # Input sanitization
│   │   └── screenshot.js               # Screenshot utilities
│   └── routes/
│       └── index.js                    # Route definitions
├── k8s/                                # Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── hpa.yaml
│   ├── ingress.yaml
│   ├── servicemonitor.yaml
│   └── kustomization.yaml
├── test/                               # Test files
├── logs/                               # Application logs
├── screenshots/                        # Debug screenshots
├── Dockerfile                          # Production Docker image
├── docker-compose.yml                  # Docker Compose config
├── Makefile                            # Build automation
└── package.json
```

## 📋 Requirements

- **Node.js**: >= 20.0.0 (LTS recommended)
- **npm**: >= 10.0.0
- **Chrome/Chromium**: Automatically installed by Puppeteer in Docker
- **Google Cloud Storage**: Optional, for screenshot storage
- **Kubernetes**: 1.25+ for production deployment

## 🚀 Quick Start

### Local Development

1. **Clone the repository**:
```bash
git clone <repository-url>
cd line-shop-runner-service
```

2. **Install dependencies**:
```bash
npm install
# or
make install
```

3. **Create environment file**:
```bash
# Create .env file with your configuration
cat > .env << EOF
APP_ENV=development
APP_PORT=4000
API_KEY=$(openssl rand -hex 32)
CRAWLER_DEBUGGING=true
LOG_LEVEL=debug
EOF
```

4. **Start the service**:
```bash
# Development mode with auto-reload
npm run dev
# or
make dev

# Production mode
npm start
# or
make start
```

5. **Test the API**:
```bash
# Health check
curl http://localhost:4000/healthz

# API info
curl http://localhost:4000/api

# Metrics
curl http://localhost:4000/metrics
```

### Docker Deployment

```bash
# Build and run
make docker-build
make docker-up

# View logs
make docker-logs

# Stop
make docker-down
```

### Kubernetes Deployment

```bash
# Deploy using kustomize
make k8s-deploy

# Check status
make k8s-status

# View logs
make k8s-logs
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `APP_ENV` | Environment (development/staging/production) | development | Yes |
| `APP_PORT` | Server port | 4000 | No |
| `API_KEY` | API authentication key(s), comma-separated | - | Yes (prod) |
| `CORS_ORIGIN` | Allowed CORS origin | * (dev) | Yes (prod) |
| `REQUEST_TIMEOUT_MS` | Request timeout in ms | 300000 | No |
| `SHUTDOWN_TIMEOUT_MS` | Graceful shutdown timeout | 300000 | No |
| `PUPPETEER_TIMEOUT` | Puppeteer operation timeout | 300000 | No |
| `CRAWLER_DEBUGGING` | Enable browser window | false | No |
| `SCREENSHOTS_DISABLED` | Disable screenshots | false | No |
| `LOG_LEVEL` | Log level (error/warn/info/debug) | info | No |
| `LOG_FORMAT` | Log format (json/simple) | json | No |
| `DISABLE_RATE_LIMIT` | Disable rate limiting | false | No |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 60000 | No |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 60 | No |
| `METRICS_DISABLED` | Disable Prometheus metrics | false | No |
| `METRICS_PATH` | Metrics endpoint path | /metrics | No |
| `GCS_BUCKET_NAME` | GCS bucket for screenshots | - | No |
| `GCS_KEY_FILE` | GCS service account key path | - | No |
| `GCS_PROJECT_ID` | GCS project ID | - | No |

### Production Checklist

- [ ] Set `APP_ENV=production`
- [ ] Configure strong `API_KEY` (min 32 characters)
- [ ] Set specific `CORS_ORIGIN` (not `*`)
- [ ] Disable `CRAWLER_DEBUGGING`
- [ ] Configure GCS for screenshot storage
- [ ] Set up log rotation
- [ ] Configure monitoring/alerts with Prometheus
- [ ] Use HTTPS via ingress/load balancer
- [ ] Review rate limiting settings

## 📚 API Documentation

### Base URL
```
http://localhost:4000
```

### Authentication

All `/api/*` endpoints require API key authentication:

```bash
curl -H "X-API-Key: your-api-key" http://localhost:4000/api/orders/create
```

### Endpoints

#### Health Check

**GET** `/healthz`

Basic health check for load balancers.

```json
{
  "uptime": 3600,
  "message": "OK",
  "timestamp": 1699960800000,
  "environment": "production"
}
```

**GET** `/healthz/detailed`

Detailed health check with dependency status.

```json
{
  "uptime": 3600,
  "timestamp": 1699960800000,
  "environment": "production",
  "status": "healthy",
  "checks": {
    "memory": { "status": "ok", "heapUsed": "128MB" },
    "browser": { "status": "ok", "message": "Browser can launch" },
    "gcs": { "status": "ok", "message": "GCS accessible" }
  }
}
```

**GET** `/ready`

Kubernetes readiness probe.

**GET** `/live`

Kubernetes liveness probe.

#### Metrics

**GET** `/metrics`

Prometheus-compatible metrics.

```
# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",route="/api/orders/create",status_code="200",le="10"} 45
...
```

#### Create Order

**POST** `/api/orders/create`

Create a new order on EC-Force platform.

**Headers:**
```
Content-Type: application/json
X-API-Key: your-api-key
```

**Request Body:**
```json
{
  "account": {
    "id": 1,
    "name": "shop-name",
    "options": {
      "ec_force_info": {
        "email": "admin@example.com",
        "password": "password123",
        "shop_url": "https://admin.ecforce.example.com"
      },
      "line_message_api_channel_id": "1234567890",
      "line_message_api_channel_secret": "abcdef123456",
      "line_message_api_channel_token": "xyz789"
    }
  },
  "customer": {
    "id": 7111074,
    "ext_id": "107745",
    "account_id": 1,
    "uid": "U1234567890abcdef",
    "display_name": "Customer Name"
  },
  "form_data": {
    "customer_id": "107745",
    "product": {
      "name": "Product Name"
    },
    "shipping_address_id": "67890",
    "payment_method_id": "1",
    "credit_card_id": "12345"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "order_id": "12345",
    "order_number": "ORD-20251114-001",
    "customer_number": "CUST-12345",
    "total_amount": "¥10,000",
    "created_at": "2025-11-14T10:00:00.000Z",
    "order_url": "https://admin.ecforce.example.com/admin/orders/12345"
  },
  "meta": {
    "execution_time_ms": 15320,
    "request_id": "req_1699960800000_abc123"
  }
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
      "selector": "#add_order_item"
    }
  },
  "requestId": "req_1699960800000_abc123"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `LOGIN_FAILED` | 401 | EC-Force login failed |
| `NOT_FOUND` | 404 | Route not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `BROWSER_INIT_FAILED` | 500 | Browser failed to start |
| `ELEMENT_NOT_FOUND` | 500 | Page element not found |
| `ORDER_SUBMISSION_FAILED` | 500 | Order submission failed |
| `TIMEOUT_ERROR` | 504 | Operation timed out |

## 🚀 Deployment

### Docker

```bash
# Build image
docker build -t line-shop-runner-service:latest .

# Run with environment variables
docker run -d \
  -p 4000:4000 \
  -e APP_ENV=production \
  -e API_KEY=your-secure-api-key \
  -e CORS_ORIGIN=https://your-domain.com \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/screenshots:/app/screenshots \
  --name line-shop-runner \
  line-shop-runner-service:latest
```

### Docker Compose

```bash
# Set environment variables
export API_KEY=$(openssl rand -hex 32)
export CORS_ORIGIN=https://your-domain.com

# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Kubernetes

1. **Update secrets** in `k8s/secret.yaml`:
```bash
# Generate API key
openssl rand -hex 32
```

2. **Update image** in `k8s/kustomization.yaml`:
```yaml
images:
  - name: line-shop-runner-service
    newName: your-registry/line-shop-runner-service
    newTag: v1.0.0
```

3. **Deploy**:
```bash
# Apply all resources
kubectl apply -k k8s/

# Check status
kubectl get pods -n line-shop
kubectl get hpa -n line-shop

# View logs
kubectl logs -f -l app.kubernetes.io/name=line-shop-runner -n line-shop
```

4. **Configure Ingress** (optional):
   - Update `k8s/ingress.yaml` with your domain
   - Configure TLS certificate

## 📊 Monitoring

### Prometheus Metrics

The service exposes metrics at `/metrics`:

```bash
curl http://localhost:4000/metrics
```

**Key Metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `http_request_duration_seconds` | Histogram | HTTP request latency |
| `http_request_total` | Counter | Total HTTP requests |
| `http_requests_in_progress` | Gauge | Current in-flight requests |
| `crawler_execution_duration_seconds` | Histogram | Crawler execution time |
| `crawler_errors_total` | Counter | Crawler errors by type |
| `orders_created_total` | Counter | Successful orders |
| `orders_failed_total` | Counter | Failed orders |
| `gcs_uploads_total` | Counter | GCS upload status |

### Grafana Dashboard

Import the provided dashboard or create custom panels using the metrics above.

### Alerting

See `k8s/servicemonitor.yaml` for Prometheus alerting rules:

- High error rate (> 5%)
- High latency (p95 > 30s)
- Crawler failures
- Pod not ready
- High memory usage (> 90%)

## 🔒 Security

### Authentication

- API key authentication via `X-API-Key` header
- Constant-time comparison to prevent timing attacks
- Support for multiple keys (comma-separated) for rotation

### Rate Limiting

- Configurable rate limiting per IP
- Default: 60 requests per minute
- Returns `429 Too Many Requests` when exceeded

### Input Validation

- Request validation with Joi
- URL sanitization
- Customer ID validation
- XSS prevention

### Security Headers

- Helmet.js for security headers
- CORS configuration
- No sensitive data in logs

### Container Security

- Non-root user (UID 1001)
- Read-only root filesystem (where possible)
- Dropped capabilities
- No privilege escalation

## 🛠️ Development

### Available Scripts

```bash
# Install dependencies
npm install

# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Makefile Commands

```bash
make help              # Show all commands
make install           # Install dependencies
make dev               # Development mode
make start             # Production mode
make test              # Run tests
make docker-build      # Build Docker image
make docker-up         # Start with Docker Compose
make docker-logs       # View Docker logs
make k8s-deploy        # Deploy to Kubernetes
make k8s-status        # Check K8s status
make generate-api-key  # Generate secure API key
make health-check      # Check service health
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- test/controllers/orderController.test.js

# Watch mode
npm run test:watch
```

## 🐛 Troubleshooting

### Browser fails to launch

**Problem:** Puppeteer cannot launch Chrome/Chromium

**Solutions:**
- In Docker: Ensure Chromium is installed (check Dockerfile)
- Check `PUPPETEER_EXECUTABLE_PATH` environment variable
- Verify sufficient memory (minimum 512MB recommended)

### Login fails

**Problem:** Cannot login to EC-Force admin

**Solutions:**
- Verify credentials are correct
- Check if shop URL is accessible
- Review screenshot in `screenshots/` directory
- Enable debug mode: `CRAWLER_DEBUGGING=true`

### Element not found errors

**Problem:** Crawler cannot find page elements

**Solutions:**
- EC-Force may have updated their UI
- Check screenshots to see actual page state
- Update selectors in `EcForceOrderCrawler.js`
- Increase timeout: `PUPPETEER_TIMEOUT=600000`

### Memory issues

**Problem:** Service runs out of memory

**Solutions:**
- Ensure browsers are properly closed after each request
- Increase container memory limits (minimum 1GB recommended)
- Check for memory leaks in logs
- Monitor with `http://localhost:4000/metrics`

### Rate limiting

**Problem:** Getting 429 Too Many Requests

**Solutions:**
- Increase `RATE_LIMIT_MAX_REQUESTS`
- Increase `RATE_LIMIT_WINDOW_MS`
- Implement client-side request queuing

## 👥 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a Pull Request

### Code Style

- Use ESLint configuration
- Write tests for new features
- Update documentation as needed

## 📄 License

MIT License - see LICENSE file for details.

## 📧 Support

For issues and questions, please create an issue in the repository.

---

**Built with ❤️ using Node.js and Puppeteer**
