# Line Shop Runner Service - Project Plan

## 📋 Project Overview

**Project Name:** Line Shop Runner Service  
**Description:** Node.js service for automating order creation on EC-Force platform using Puppeteer  
**Technology Stack:** Node.js 18+, Express.js, Puppeteer, Winston, Docker  
**Architecture:** REST API with browser automation backend

---

## 🎯 Project Goals

1. **Automate EC-Force Order Creation**: Programmatically create orders through web automation
2. **Provide RESTful API**: Simple, reliable API for order management
3. **Production Ready**: Containerized, logged, monitored, and scalable
4. **Error Resilient**: Comprehensive error handling with retry logic and debugging support

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
│   Express.js REST API           │
│   - Routes & Controllers        │
│   - Validation & Middleware     │
│   - Request ID Tracking         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Crawler Service Layer         │
│   - BaseCrawler                 │
│   - EcForceOrderCrawler         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Puppeteer Browser Automation  │
│   - Chrome/Chromium             │
│   - Page Interactions           │
│   - Screenshot Capture          │
└─────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   EC-Force Platform             │
│   (Target Website)              │
└─────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 18+ | JavaScript runtime |
| **Web Framework** | Express.js 4.x | REST API server |
| **Browser Automation** | Puppeteer 24+ | Web scraping and automation |
| **Validation** | Joi 17.x | Request data validation |
| **Logging** | Winston 3.x | Application logging |
| **Security** | Helmet, CORS | HTTP security headers |
| **Container** | Docker | Application containerization |
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

### Phase 2 (Production Ready)
- [ ] API authentication (API keys)
- [ ] Rate limiting
- [ ] Queue system (Redis/Bull)
- [ ] Database for order history
- [ ] Webhook notifications

### Phase 3 (Advanced Features)
- [ ] Multi-platform support (other e-commerce platforms)
- [ ] Batch order processing
- [ ] Web dashboard for monitoring
- [ ] Advanced analytics
- [ ] Caching layer

### Phase 4 (Enterprise)
- [ ] Multi-tenancy support
- [ ] Role-based access control
- [ ] Advanced scheduling
- [ ] Prometheus metrics
- [ ] OpenAPI/Swagger documentation

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

### Code Quality
- No linting (simplified project)
- No testing (focus on core functionality)
- Manual QA testing recommended

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
