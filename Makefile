# =============================================================================
# Makefile for Line Shop Runner Service
# =============================================================================

.PHONY: help install dev start test lint docker-build docker-up docker-down \
        docker-logs docker-restart clean clean-all setup k8s-deploy k8s-delete

# Default target
.DEFAULT_GOAL := help

# Variables
IMAGE_NAME ?= line-shop-runner-service
IMAGE_TAG ?= latest
REGISTRY ?= your-registry
K8S_NAMESPACE ?= line-shop

# =============================================================================
# Help
# =============================================================================
help: ## Show this help message
	@echo ''
	@echo 'Line Shop Runner Service - Available Commands'
	@echo '=============================================='
	@echo ''
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ''

# =============================================================================
# Development
# =============================================================================
install: ## Install dependencies
	npm install

dev: ## Run in development mode with nodemon
	npm run dev

start: ## Start the application
	npm start

test: ## Run tests
	npm test

test-coverage: ## Run tests with coverage
	npm run test:coverage

lint: ## Run linter (if configured)
	npm run lint 2>/dev/null || echo "Linting not configured"

# =============================================================================
# Docker
# =============================================================================
docker-build: ## Build Docker image
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

docker-build-no-cache: ## Build Docker image without cache
	docker build --no-cache -t $(IMAGE_NAME):$(IMAGE_TAG) .

docker-push: ## Push Docker image to registry
	docker tag $(IMAGE_NAME):$(IMAGE_TAG) $(REGISTRY)/$(IMAGE_NAME):$(IMAGE_TAG)
	docker push $(REGISTRY)/$(IMAGE_NAME):$(IMAGE_TAG)

docker-up: ## Start Docker container
	docker-compose up -d

docker-down: ## Stop Docker container
	docker-compose down

docker-logs: ## View Docker logs
	docker-compose logs -f

docker-restart: ## Restart Docker container
	docker-compose restart

docker-shell: ## Open shell in running container
	docker-compose exec line-shop-runner /bin/sh

docker-clean: ## Remove Docker images and containers
	docker-compose down --rmi local -v

# =============================================================================
# Kubernetes
# =============================================================================
k8s-deploy: ## Deploy to Kubernetes using kustomize
	kubectl apply -k k8s/

k8s-delete: ## Delete from Kubernetes
	kubectl delete -k k8s/

k8s-logs: ## View Kubernetes logs
	kubectl logs -f -l app.kubernetes.io/name=line-shop-runner -n $(K8S_NAMESPACE)

k8s-status: ## Check Kubernetes deployment status
	kubectl get pods,svc,hpa -l app.kubernetes.io/name=line-shop-runner -n $(K8S_NAMESPACE)

k8s-describe: ## Describe Kubernetes resources
	kubectl describe deployment line-shop-runner -n $(K8S_NAMESPACE)

k8s-rollout-status: ## Check rollout status
	kubectl rollout status deployment/line-shop-runner -n $(K8S_NAMESPACE)

k8s-rollout-restart: ## Restart deployment
	kubectl rollout restart deployment/line-shop-runner -n $(K8S_NAMESPACE)

# =============================================================================
# Cleanup
# =============================================================================
clean: ## Clean logs and screenshots
	rm -rf logs/* screenshots/*
	@echo "Cleaned logs and screenshots directories"

clean-all: clean ## Clean everything including node_modules
	rm -rf node_modules coverage
	@echo "Cleaned all generated files"

# =============================================================================
# Setup
# =============================================================================
setup: ## Initial setup (install + create directories)
	@echo "Setting up Line Shop Runner Service..."
	npm install
	mkdir -p logs screenshots
	@echo ""
	@echo "Setup complete!"
	@echo "Next steps:"
	@echo "  1. Create .env file with your configuration"
	@echo "  2. Run 'make dev' to start development server"
	@echo ""

setup-k8s: ## Setup Kubernetes secrets (interactive)
	@echo "Creating Kubernetes namespace and secrets..."
	kubectl create namespace $(K8S_NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	@echo ""
	@echo "Please create secrets manually:"
	@echo "  kubectl create secret generic line-shop-runner-secrets \\"
	@echo "    --from-literal=API_KEY=your-api-key \\"
	@echo "    -n $(K8S_NAMESPACE)"

# =============================================================================
# Utilities
# =============================================================================
generate-api-key: ## Generate a secure API key
	@openssl rand -hex 32

health-check: ## Check service health
	@curl -s http://localhost:4000/healthz | jq . 2>/dev/null || curl -s http://localhost:4000/healthz

metrics: ## View Prometheus metrics
	@curl -s http://localhost:4000/metrics
