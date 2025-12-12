# Line Shop Runner Service

A production-ready Node.js service for automating order creation on EC-Force platform using Puppeteer. Designed for Kubernetes deployment with horizontal scaling, shared circuit breaker state, and comprehensive monitoring.

## 🚀 Features

### Core Features
- **Browser Automation**: Powered by Puppeteer for reliable web automation
- **RESTful API**: Simple and intuitive API endpoints
- **Browser Pooling**: Efficient browser instance management (1-5 instances)
- **Error Handling**: Comprehensive error handling with automatic screenshots
- **Retry Logic**: Automatic retries for failed operations with exponential backoff
- **Logging**: Detailed logging with Winston and async context tracking

### Production Features
- **🔄 Distributed Circuit Breaker**: Redis-based shared state across all pods
- **📊 Prometheus Metrics**: Comprehensive metrics for monitoring and alerting
- **☸️ Kubernetes Ready**: HPA-compatible with proper health checks
- **🔒 Security**: API key authentication, rate limiting, input sanitization, Helmet, CORS
- **📸 GCS Integration**: Screenshot upload to Google Cloud Storage with signed URLs
- **🏥 Health Checks**: `/healthz` and `/healthz/detailed` endpoints
- **🐳 Docker Support**: Production-ready containerization

### Observability & Monitoring
- HTTP request metrics (duration, count, in-progress)
- Browser pool metrics (size by status, wait time, lifecycle)
- Circuit breaker metrics (state, failures, transitions, open duration)
- Crawler metrics (execution time, errors, step timing)
- Business metrics (orders created/failed by shop)
- GCS upload metrics (duration, success rate)

## 📋 Requirements

- Node.js >= 18.0.0
- npm
- Chrome/Chromium (automatically installed by Puppeteer)
- Redis (for distributed circuit breaker) - Optional but recommended for multi-pod deployments
- Google Cloud Storage (optional, for screenshot storage)
- Kubernetes 1.20+ (for production deployment)

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
# Application settings
APP_ENV=development
APP_PORT=4000
API_KEY=your-secret-api-key

# Crawler settings
CRAWLER_DEBUGGING=true

# Redis (for distributed circuit breaker)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# Metrics
METRICS_ENABLED=true
METRICS_PATH=/metrics

# Google Cloud Storage (optional)
GCS_BUCKET_NAME=your-bucket-name
GCS_KEY_FILE=/path/to/service-account-key.json
GCS_PROJECT_ID=your-project-id
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

### Kubernetes Deployment

For production Kubernetes deployment with HPA, see [PLAN.md](PLAN.md) for detailed instructions.

```bash
# Deploy all resources
kubectl apply -f k8s/

# Check deployment
kubectl get pods
kubectl get hpa

# View metrics
kubectl port-forward svc/line-shop-runner 9090:4000
curl http://localhost:9090/metrics
```

## 📚 API Documentation

### Base URL
```
http://localhost:4000
```

### Endpoints

#### 1. Health Check

**GET** `/healthz`

Check if the service is running.

**Response:**
```json
{
  "uptime": 3600,
  "message": "OK",
  "timestamp": 1699960800000,
  "environment": "development"
}
```

#### 2. Create Order

**POST** `/api/orders/create`

Create a new order on EC-Force platform.

**Headers:**
```
Content-Type: application/json
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

#### 5. Prometheus Metrics (NEW)

**GET** `/metrics`

Prometheus-compatible metrics endpoint for monitoring.

**Response:**
```
# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",route="/api/orders/create",status="200",le="0.1"} 45
http_request_duration_seconds_bucket{method="POST",route="/api/orders/create",status="200",le="0.5"} 120
...

# HELP circuit_breaker_state Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)
# TYPE circuit_breaker_state gauge
circuit_breaker_state{service="ecforce",name="ec-force"} 0

# HELP browser_pool_size Current browser pool size by status
# TYPE browser_pool_size gauge
browser_pool_size{status="idle"} 3
browser_pool_size{status="busy"} 2
...
```

**Usage with Prometheus:**
```yaml
scrape_configs:
  - job_name: 'line-shop-runner'
    static_configs:
      - targets: ['line-shop-runner:4000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## 🔧 Configuration

Configuration is managed through environment variables. See `.env.example` for all available options.

### Key Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_ENV` | Environment (development/production) | development |
| `APP_PORT` | Server port | 4000 |
| `API_KEY` | API authentication key | - |
| `REDIS_URL` | Redis URL for circuit breaker | redis://localhost:6379 |
| `REDIS_PASSWORD` | Redis password (optional) | - |
| `REDIS_DB` | Redis database number | 0 |
| `METRICS_ENABLED` | Enable Prometheus metrics | true |
| `METRICS_PATH` | Metrics endpoint path | /metrics |
| `CRAWLER_DEBUGGING` | Enable debugging mode | false |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket name | - |
| `GCS_KEY_FILE` | Path to GCS service account key | - |
| `GCS_PROJECT_ID` | Google Cloud Project ID | - |

## 🏗️ Architecture

### Distributed System Features

#### Redis-Based Circuit Breaker
- **Shared State**: All pods share circuit breaker state via Redis
- **Consistent Behavior**: Circuit opens simultaneously across all pods after threshold failures
- **Automatic Recovery**: Half-open state tests service recovery
- **Fallback Mode**: Works in standalone mode without Redis

#### Prometheus Metrics
- **HTTP Metrics**: Request duration, count, in-progress tracking
- **Browser Pool**: Instance lifecycle, wait times, status distribution
- **Circuit Breaker**: State changes, failure counts, open duration
- **Crawler**: Execution time, error rates, step timing
- **Business**: Orders created/failed by shop
- **GCS**: Upload performance and success rates

#### Horizontal Pod Autoscaling (HPA)
- **CPU-Based Scaling**: 70% CPU threshold
- **Pod Limits**: 2-10 pods
- **Stabilization**: 60s scale-up, 300s scale-down
- **Graceful Shutdown**: 120s termination period

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
│   │   └── requestId.js                # Request ID middleware
│   ├── utils/
│   │   ├── logger.js                   # Winston logger
│   │   ├── screenshot.js               # Screenshot utilities
│   │   └── asyncContext.js             # Async context tracking
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

## 🏗️ Development

### Available Scripts

```bash
# Start in production mode
npm start

# Start in development mode with auto-reload
npm run dev
```

### Using Makefile

```bash
# Install dependencies
make install

# Start development server
make dev

# Start production server
make start

# Docker commands
make docker-build
make docker-up
make docker-down
make docker-logs

# Clean logs and screenshots
make clean
make clean-all
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

- Helmet.js for security headers
- Input validation with Joi
- CORS configuration
- Request ID tracking
- No sensitive data in logs
- Async context for request isolation

## 🚀 Deployment

### Production Checklist

- [ ] Set `APP_ENV=production`
- [ ] Set `APP_PORT` to appropriate value
- [ ] Disable `CRAWLER_DEBUGGING` in production
- [ ] Configure GCS for screenshot storage
- [ ] Set up log rotation
- [ ] Set up monitoring/alerts
- [ ] Configure proper CORS origins
- [ ] Use HTTPS in production
- [ ] Regular screenshot cleanup
- [ ] Monitor browser instances

### Docker Production Deployment

```bash
# Build production image
docker build -t line-shop-runner-service:latest .

# Run with environment variables
docker run -d \
  -p 4000:4000 \
  -e APP_ENV=production \
  -e APP_PORT=4000 \
  -e CRAWLER_DEBUGGING=false \
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
        - containerPort: 4000
        env:
        - name: APP_ENV
          value: "production"
        - name: APP_PORT
          value: "4000"
        - name: CRAWLER_DEBUGGING
          value: "false"
        - name: GCS_BUCKET_NAME
          valueFrom:
            secretKeyRef:
              name: line-shop-secrets
              key: gcs-bucket-name
        - name: GCS_PROJECT_ID
          valueFrom:
            secretKeyRef:
              name: line-shop-secrets
              key: gcs-project-id
        livenessProbe:
          httpGet:
            path: /healthz
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /healthz
            port: 4000
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

- `/healthz` - Basic health check with system metrics

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
- [ ] API authentication
- [ ] Rate limiting

## 📝 License

MIT

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please create an issue in the repository.

---

**Built with ❤️ using Node.js and Puppeteer**
