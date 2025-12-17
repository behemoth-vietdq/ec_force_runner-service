# Line Shop Runner Service - Project Plan

## 📋 Project Overview

**Project Name:** Line Shop Runner Service  
**Description:** Production-ready Node.js service for automating order creation on EC-Force platform  
**Technology Stack:** Node.js 18+, Express.js, Puppeteer, Redis, Prometheus, Kubernetes  
**Architecture:** Distributed REST API with browser automation backend, HPA-compatible

---

## 🎯 Project Goals

1. **Automate EC-Force Order Creation**: Programmatically create orders through web automation
2. **Provide RESTful API**: Simple, reliable API for order management
3. **Production Ready**: Containerized, logged, monitored, and horizontally scalable
4. **Error Resilient**: Distributed circuit breaker with shared state across all pods
5. **Observable**: Comprehensive Prometheus metrics for monitoring and alerting
6. **Kubernetes Native**: HPA-compatible with proper health checks and graceful shutdown
7. **LINE Messaging Integration**: Automatic order notifications via LINE Messaging API

---

## 🏗️ Architecture Design

### System Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────────────────────────┐
│   Kubernetes Service            │
│   (Load Balancer)               │
└────────────┬────────────────────┘
             │
    ┌────────┴──────────┐
    │                   │
    ▼                   ▼
┌───────────┐      ┌───────────┐      ┌──────────┐
│   Pod 1   │ .... │   Pod N   │      │  Redis   │
│  Express  │      │  Express  │◄────►│ (Shared  │
│  Puppeteer│      │  Puppeteer│      │  State)  │
│   LINE    │      │   LINE    │      └──────────┘
      │                  │
      └──────────┬───────┘
                 │
                 ▼
         ┌──────────────┐
         │  Prometheus  │
         │  (Metrics)   │
         └──────────────┘
                 │
                 ▼
         ┌──────────────┐
         │   Grafana    │
         │ (Dashboard)  │
         └──────────────┘
```

### Distributed System Features

#### 1. **Redis-Based Circuit Breaker**
- **Problem**: Per-pod circuit breaker causes inconsistent behavior (3 pods × 5 failures = 15 failures before all circuits open)
- **Solution**: Shared circuit breaker state in Redis
- **Benefits**:
  - Consistent failure detection across all pods
  - Circuit opens simultaneously after threshold failures
  - Automatic recovery with half-open state testing
  - Fallback to standalone mode if Redis unavailable

#### 2. **Prometheus Metrics**
- **HTTP Metrics**: Request duration (histogram), count (counter), in-progress (gauge)
- **Browser Pool**: Instance count by status, wait time, lifecycle events
- **Circuit Breaker**: State transitions, failure count, open duration
- **Crawler**: Execution time, error rates by code, step timing
- **Business**: Orders created/failed per shop
- **GCS**: Upload duration and success rates

#### 3. **Horizontal Pod Autoscaler (HPA)**
- **Trigger**: 70% CPU utilization
- **Scaling**: 2-10 pods
- **Behavior**: 
  - Scale up: Max 2 pods or 50% per 60s
  - Scale down: Max 1 pod per 300s (5 minutes)
- **Graceful Shutdown**: 120s termination period

---

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 18+ | JavaScript runtime |
| **Web Framework** | Express.js 4.x | REST API server |
| **Browser Automation** | Puppeteer 24+ | Web scraping and automation |
| **State Management** | Redis 5.x (ioredis) | Shared circuit breaker state |
| **Monitoring** | Prometheus (prom-client) | Metrics collection |
| **Validation** | Joi 17.x | Request data validation |
| **Logging** | Winston 3.x | Application logging |
| **Security** | Helmet, CORS, Rate Limit | HTTP security |
| **Container** | Docker | Application containerization |
| **Orchestration** | Kubernetes 1.20+ | Container orchestration |
| **Cloud Storage** | Google Cloud Storage | Screenshot storage |

---

## 📂 Project Structure

```
line-shop-runner-service/
├── src/
│   ├── app.js                          # Application entry point
│   ├── config/
│   │   └── index.js                    # Centralized configuration
│   ├── controllers/
│   │   ├── orderController.js          # Order creation logic
│   │   └── healthController.js         # Health check endpoints
│   ├── services/
│   │   └── crawler/
│   │       ├── BaseCrawler.js          # Base crawler class
│   │       └── EcForceOrderCrawler.js  # EC-Force implementation
│   ├── middleware/
│   │   ├── errorHandler.js             # Error handling middleware
│   │   ├── validateRequest.js          # Request validation
│   │   ├── requestLogger.js            # HTTP request logging
│   │   └── requestId.js                # Request ID tracking
│   ├── utils/
│   │   ├── logger.js                   # Winston logger configuration
│   │   ├── screenshot.js               # Screenshot utilities
│   │   └── asyncContext.js             # Async context for request tracking
│   └── routes/
│       └── index.js                    # API route definitions
├── logs/                               # Application logs
├── screenshots/                        # Debug screenshots
├── .env.example                        # Environment template
├── .gitignore
├── package.json
├── Dockerfile                          # Docker configuration
├── docker-compose.yml                  # Docker Compose setup
├── Makefile                            # Build automation
└── README.md                           # Project documentation
```

---

## 🔧 Core Components

### 1. Configuration Management (`src/config/index.js`)

**Purpose:** Centralized configuration with environment variable management

**Key Features:**
- Environment-based configuration (development/production)
- Sensible defaults for all settings
- Type conversion for environment variables
- Configuration groups: server, puppeteer, logging, crawler, GCS

**Configuration Sections:**
```javascript
{
  server: { port, host, env },
  puppeteer: { headless, viewport, timeout },
  logging: { level, file },
  screenshots: { enabled, path },
  crawler: { maxRetries, retryDelayMs, debugging },
  gcs: { bucketName, keyFile, projectId }
}
```

### 2. Base Crawler (`src/services/crawler/BaseCrawler.js`)

**Purpose:** Reusable base class for browser automation

**Key Features:**
- Browser lifecycle management
- Navigation with retry logic
- Element interaction (click, type, select)
- Wait strategies (selectors, timeouts, navigation)
- Screenshot capture on errors
- Automatic cleanup and resource management
- Request ID tracking for debugging

**Core Methods:**
```javascript
class BaseCrawler {
  async initBrowser()           // Initialize Puppeteer browser
  async navigateTo(url)         // Navigate with retry
  async waitForSelector(selector) // Wait for elements
  async clickElement(selector)  // Click with retry
  async typeText(selector, text) // Type with delay
  async selectOption(selector, value) // Select dropdown
  async takeScreenshot(name)    // Capture screenshot
  async close()                 // Cleanup browser
  async withRetry(fn, attempts) // Retry wrapper
}
```

### 3. EC-Force Order Crawler (`src/services/crawler/EcForceOrderCrawler.js`)

**Purpose:** EC-Force specific order creation automation

**Key Features:**
- Login to EC-Force admin
- Navigate to order creation page
- Fill customer information
- Add products to order
- Select payment method
- Submit and confirm order
- Extract order details

**Workflow:**
1. Login with credentials
2. Navigate to order form
3. Select customer
4. Add product items
5. Configure shipping
6. Set billing address
7. Choose payment method
8. Submit order
9. Capture confirmation

### 4. Controllers

#### Order Controller (`src/controllers/orderController.js`)
- Handle order creation requests
- Validate input data
- Orchestrate crawler execution
- Return order results

#### Health Controller (`src/controllers/healthController.js`)
- System health checks
- Uptime monitoring
- Memory usage metrics
- Kubernetes readiness/liveness probes

### 5. Middleware

#### Error Handler (`src/middleware/errorHandler.js`)
- Centralized error handling
- Custom error classes (CrawlerError, ValidationError)
- Error logging with stack traces
- Structured error responses

#### Request Validation (`src/middleware/validateRequest.js`)
- Joi schema validation
- Input sanitization
- Required field validation
- Type checking

#### Request Logger (`src/middleware/requestLogger.js`)
- HTTP request logging
- Response time tracking
- Status code logging
- Error request logging

#### Request ID (`src/middleware/requestId.js`)
- Generate unique request IDs
- Track requests through async operations
- Correlation for debugging

### 6. Utilities

#### Logger (`src/utils/logger.js`)
- Winston-based logging
- Multiple transports (console, file)
- Log levels (error, warn, info, debug)
- Request context in logs
- Async local storage for request tracking

#### Screenshot (`src/utils/screenshot.js`)
- Capture error screenshots
- Upload to Google Cloud Storage
- Automatic cleanup of old screenshots
- Screenshot naming with timestamps

#### Async Context (`src/utils/asyncContext.js`)
- AsyncLocalStorage for request tracking
- Context-aware logging
- Request ID propagation

#### Circuit Breaker (`src/utils/circuitBreaker.js`) **[DISTRIBUTED]**
- **Redis-based shared state** across all pods
- Failure detection with configurable thresholds
- Automatic state transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
- Metrics integration for monitoring
- Fallback to standalone mode without Redis
- Two preconfigured instances:
  - `ecforce`: For EC-Force operations (5 failures, 30s timeout, 60s reset)
  - `gcs`: For GCS uploads (3 failures, 10s timeout, 30s reset)

#### Browser Pool (`src/utils/browserPool.js`)
- Pool of 1-5 browser instances
- Automatic instance creation and retirement
- Wait queue for busy periods
- Health monitoring and auto-restart
- Metrics for pool size and wait times

#### Metrics (`src/utils/metrics.js`) **[NEW]**
- **Prometheus metrics collection**
- HTTP request metrics (duration histogram, count, in-progress)
- Browser pool metrics (size by status, wait time, instances)
- Circuit breaker metrics (state, failures, transitions, open duration)
- Crawler metrics (execution time, errors by code, step timing, screenshots)
- Business metrics (orders created/failed per shop)
- GCS metrics (upload duration, success rate)
- Express middleware integration
- `/metrics` endpoint for Prometheus scraping

---

## 🚀 API Endpoints

### Health Check Endpoints

#### `GET /healthz`
**Purpose:** Basic health check with system metrics

**Response:**
```json
{
  "uptime": 3600,
  "message": "OK",
  "timestamp": 1699960800000,
  "environment": "development"
}
```

#### `GET /healthz/detailed`
**Purpose:** Detailed health check with circuit breaker status

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": 1699960800000,
  "environment": "production",
  "memory": {
    "heapUsed": 50000000,
    "heapTotal": 100000000,
    "rss": 120000000
  },
  "circuitBreakers": [
    {
      "name": "ec-force",
      "service": "ecforce",
      "state": "CLOSED",
      "failureCount": 0,
      "config": { "failureThreshold": 5, "timeout": 30000 }
    }
  ]
}
```

#### `GET /metrics` **[NEW]**
**Purpose:** Prometheus metrics endpoint

**Response:** Prometheus text format with all metrics

### Order Management Endpoints

#### `POST /api/orders/create`
**Purpose:** Create a new order on EC-Force

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
      "name": "Product Name",
      "quantity": 1
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
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "request_id": "req_1699960800000_abc123",
  "data": {
    "order_number": "ORD-20251212-001",
    "customer_number": "CUST-12345",
    "total": "¥10,000",
    "created_at": "2025-12-12T10:00:00.000Z"
  },
  "execution_time_ms": 15320
}
```

**Error Response:**
```json
{
  "success": false,
  "request_id": "req_1699960800000_abc123",
  "error": {
    "code": "ELEMENT_NOT_FOUND",
    "message": "Element not found: #add_order_item",
    "details": {
      "selector": "#add_order_item",
      "screenshot_url": "gs://bucket/screenshots/error_123.png"
    }
  }
}
```

---

## 🔐 Security Considerations

### Current Implementation
- **Helmet.js**: Security headers (XSS, clickjacking protection)
- **CORS**: Cross-origin resource sharing configuration
- **Input Validation**: Joi schema validation for all inputs
- **Request ID Tracking**: Correlation for security auditing
- **No Sensitive Logging**: Credentials never logged

### Future Enhancements
- API key authentication
- Rate limiting per IP/API key
- Request signing
- JWT token support
- Role-based access control

---

## 📊 Logging Strategy

### Log Levels
- **ERROR**: Application errors, exceptions
- **WARN**: Deprecations, warnings
- **INFO**: Request/response, lifecycle events
- **DEBUG**: Detailed debugging information

### Log Destinations
- **Console**: Development mode, real-time debugging
- **File**: `logs/app.log` (all logs), `logs/error.log` (errors only)
- **Future**: Structured logging to ELK/CloudWatch

### Log Format
```json
{
  "timestamp": "2025-12-12T10:00:00.000Z",
  "level": "info",
  "message": "Order created successfully",
  "requestId": "req_1699960800000_abc123",
  "duration": 15320,
  "meta": {
    "orderId": "ORD-20251212-001"
  }
}
```

---

## 🐳 Deployment

### Docker Deployment

**Dockerfile Features:**
- Alpine Linux base for small image size
- Pre-installed Chromium
- Non-root user for security
- Health checks
- Multi-stage build ready

**Docker Compose Features:**
- Volume mounts for logs and screenshots
- Environment variable configuration
- Network isolation
- Restart policies

### Kubernetes Deployment

**Key Resources:**
- **Deployment**: 2+ replicas for high availability
- **Service**: ClusterIP for internal access
- **ConfigMap**: Environment configuration
- **Secret**: Sensitive credentials (GCS keys)
- **Health Checks**: Liveness and readiness probes

---

## 📈 Monitoring & Observability

### Health Check Strategy
- **Endpoint**: `GET /healthz`
- **Metrics**: Uptime, memory usage, response time
- **Kubernetes Probes**: Readiness and liveness

### Metrics to Monitor
- Request rate (requests/second)
- Success/failure rate (%)
- Response time (p50, p95, p99)
- Error rate by type
- Browser instance count
- Memory/CPU usage

### Future Monitoring
- Prometheus metrics endpoint
- Grafana dashboards
- Alert rules for failures
- Distributed tracing with OpenTelemetry

---

## 🔄 Error Handling Strategy

### Error Categories

1. **Validation Errors** (400)
   - Invalid input data
   - Missing required fields
   - Type mismatches

2. **Authentication Errors** (401)
   - Invalid credentials
   - Login failures

3. **Crawler Errors** (500)
   - Element not found
   - Navigation timeout
   - Browser launch failure

4. **Business Logic Errors** (422)
   - Order already exists
   - Invalid customer ID
   - Product out of stock

### Retry Strategy
- **Max Retries**: 3 attempts (configurable)
- **Retry Delay**: 2000ms with exponential backoff
- **Retryable Errors**: Network timeouts, transient failures
- **Non-retryable**: Validation errors, authentication failures

### Screenshot on Error
- Automatically capture page state
- Upload to Google Cloud Storage
- Include in error response
- Cleanup old screenshots (7 days)

---

## 🚧 Future Enhancements

### Phase 1 (Core Features)
- [x] Basic order creation automation
- [x] Error handling with screenshots
- [x] Docker containerization
- [x] Health check endpoints
- [x] Request ID tracking

### Phase 2 (Production Ready) **[COMPLETED]**
- [x] API authentication (API keys)
- [x] Rate limiting
- [x] Input sanitization
- [x] Kubernetes deployment with HPA
- [x] **Distributed circuit breaker with Redis**
- [x] **Prometheus metrics integration**
- [x] Browser pooling
- [x] Graceful shutdown
- [x] Detailed health checks with circuit breaker status
- [x] Screenshot upload to GCS with signed URLs
- [x] Comprehensive logging with request tracking

### Phase 3 (Future Enhancements)
- [ ] Queue system (Redis/Bull) for async processing
- [ ] Database for order history
- [ ] Webhook notifications
- [ ] Multi-platform support (other e-commerce platforms)
- [ ] Batch order processing
- [ ] Web dashboard for monitoring (Grafana dashboards)
- [ ] Advanced analytics

### Phase 4 (Enterprise)
- [ ] Multi-tenancy support
- [ ] Role-based access control
- [ ] Advanced scheduling
- [ ] OpenAPI/Swagger documentation
- [ ] Distributed tracing (Jaeger/Zipkin)

---

## 📝 Development Workflow

### Local Development
1. Clone repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env`
4. Configure environment variables
5. Run development server: `npm run dev`
6. Test API endpoints

### Docker Development
1. Build image: `make docker-build`
2. Run container: `make docker-up`
3. View logs: `make docker-logs`
4. Stop container: `make docker-down`

### Kubernetes Deployment **[PRODUCTION-READY]**

#### Prerequisites
- Kubernetes cluster 1.20+
- kubectl configured
- Docker registry access
- Redis instance (managed or self-hosted)
- Prometheus (for metrics scraping)

#### Deployment Steps

1. **Create namespace:**
```bash
kubectl create namespace line-shop-runner
```

2. **Create secrets:**
```bash
# API Key
kubectl create secret generic line-shop-runner-secret \
  --from-literal=API_KEY=your-secret-api-key \
  --namespace line-shop-runner

# Redis (if password required)
kubectl create secret generic redis-secret \
  --from-literal=REDIS_PASSWORD=your-redis-password \
  --namespace line-shop-runner

# GCS Service Account (optional)
kubectl create secret generic gcs-key \
  --from-file=key.json=/path/to/service-account-key.json \
  --namespace line-shop-runner
```

3. **Configure ConfigMap:**
```bash
kubectl apply -f k8s/configmap.yaml
```

Edit `k8s/configmap.yaml` with your configuration:
```yaml
data:
  APP_ENV: "production"
  REDIS_URL: "redis://redis-service:6379"
  METRICS_ENABLED: "true"
  CRAWLER_DEBUGGING: "false"
  # ... other configs
```

4. **Deploy application:**
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
```

5. **Verify deployment:**
```bash
# Check pods
kubectl get pods -n line-shop-runner

# Check HPA
kubectl get hpa -n line-shop-runner

# Check service
kubectl get svc -n line-shop-runner

# Check logs
kubectl logs -f deployment/line-shop-runner -n line-shop-runner
```

6. **Test health check:**
```bash
kubectl port-forward svc/line-shop-runner 8080:4000 -n line-shop-runner
curl http://localhost:8080/healthz
curl http://localhost:8080/healthz/detailed
```

#### Monitoring Setup

1. **Configure Prometheus scraping:**
```yaml
# prometheus-config.yaml
scrape_configs:
  - job_name: 'line-shop-runner'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
            - line-shop-runner
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        action: keep
        regex: line-shop-runner
    metrics_path: '/metrics'
    scrape_interval: 15s
```

2. **Import Grafana dashboards:**
- HTTP request metrics dashboard
- Circuit breaker status dashboard
- Browser pool monitoring dashboard
- Business metrics (orders per shop)

3. **Set up alerts:**
```yaml
# Example Prometheus alert rules
groups:
  - name: line-shop-runner
    rules:
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state{state="OPEN"} > 0
        for: 5m
        annotations:
          summary: "Circuit breaker is open for {{ $labels.service }}"
      
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High error rate detected"
      
      - alert: BrowserPoolExhausted
        expr: browser_pool_wait_time_seconds > 30
        for: 2m
        annotations:
          summary: "Browser pool wait time is too high"
```

#### Scaling Configuration

**Current HPA Settings:**
- Min replicas: 2
- Max replicas: 10
- Target CPU: 70%
- Scale up: Max 2 pods or 50% every 60s
- Scale down: Max 1 pod every 300s (5 min)

**Tuning Recommendations:**
- **Light load** (< 100 req/min): 2-3 pods, 80% CPU
- **Medium load** (100-500 req/min): 3-6 pods, 70% CPU
- **Heavy load** (> 500 req/min): 6-10 pods, 60% CPU

**Resource Recommendations:**
```yaml
resources:
  requests:
    cpu: 500m        # Guaranteed CPU
    memory: 1Gi      # Guaranteed memory
  limits:
    cpu: 1000m       # Max CPU (1 core)
    memory: 2Gi      # Max memory
```

#### Troubleshooting Production

**Pod crashes:**
```bash
kubectl logs -n line-shop-runner <pod-name> --previous
kubectl describe pod -n line-shop-runner <pod-name>
```

**Circuit breaker issues:**
```bash
# Check Redis connectivity
kubectl exec -it deployment/line-shop-runner -n line-shop-runner -- sh
# Inside pod:
redis-cli -h redis-service ping
```

**Metrics not showing:**
```bash
# Test metrics endpoint
kubectl port-forward svc/line-shop-runner 9090:4000 -n line-shop-runner
curl http://localhost:9090/metrics

# Check Prometheus targets
# Navigate to Prometheus UI → Status → Targets
```

**HPA not scaling:**
```bash
# Check metrics-server
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes

# Check HPA status
kubectl describe hpa line-shop-runner -n line-shop-runner

# View current metrics
kubectl top pods -n line-shop-runner
```

### Code Quality
- No linting (simplified project)
- No unit tests (focus on core functionality)
- Manual QA testing recommended
- Production monitoring via Prometheus/Grafana

---

## 🐛 Troubleshooting Guide

### Common Issues

#### Browser Launch Failures
**Symptoms:** Puppeteer cannot launch Chrome  
**Solutions:**
- Install system dependencies (see Dockerfile)
- Check Docker memory limits
- Verify PUPPETEER_EXECUTABLE_PATH

#### Element Not Found
**Symptoms:** Selectors not matching  
**Solutions:**
- Check screenshots in `screenshots/` directory
- Update selectors in EcForceOrderCrawler
- Enable debug mode: `CRAWLER_DEBUGGING=true`
- Increase timeout values

#### Memory Issues
**Symptoms:** Container OOM, high memory usage  
**Solutions:**
- Ensure browsers are properly closed
- Reduce concurrent requests
- Increase container memory
- Monitor browser instances

#### Login Failures
**Symptoms:** Cannot authenticate  
**Solutions:**
- Verify credentials are correct
- Check if EC-Force changed login flow
- Review screenshots
- Check for CAPTCHA/2FA

---

## 📚 References

### Documentation
- [Puppeteer API](https://pptr.dev/)
- [Express.js Guide](https://expressjs.com/)
- [Winston Logger](https://github.com/winstonjs/winston)
- [Docker Documentation](https://docs.docker.com/)

### Best Practices
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Puppeteer Best Practices](https://github.com/puppeteer/puppeteer/blob/main/docs/api.md)
- [REST API Design](https://restfulapi.net/)

---

## 👥 Team & Responsibilities

**Developer:** Full-stack development, deployment  
**Operations:** Docker, Kubernetes, monitoring  
**QA:** Manual testing, bug reporting

---

## 📅 Project Timeline

### Completed
- ✅ Project setup and structure
- ✅ Configuration management
- ✅ Base crawler implementation
- ✅ EC-Force order crawler
- ✅ REST API endpoints
- ✅ Error handling and logging
- ✅ Docker containerization
- ✅ Screenshot capture and GCS upload
- ✅ Health check endpoints

### In Progress
- 🔄 Production deployment
- 🔄 Performance optimization
- 🔄 Documentation updates

### Planned
- 📋 API authentication
- 📋 Queue system
- 📋 Database integration
- 📋 Advanced monitoring

---

**Last Updated:** December 12, 2025  
**Version:** 1.0.0  
**Status:** Production Ready (Core Features Complete)
