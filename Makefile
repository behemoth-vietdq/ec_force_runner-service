.PHONY: help install dev start build docker-build docker-up docker-down docker-logs clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install

dev: ## Run in development mode with nodemon
	npm run dev

start: ## Start the application
	npm start

docker-build: ## Build Docker image
	docker build -t line-shop-runner-service:latest .

docker-up: ## Start Docker container
	docker-compose up -d

docker-down: ## Stop Docker container
	docker-compose down

docker-logs: ## View Docker logs
	docker-compose logs -f

docker-restart: ## Restart Docker container
	docker-compose restart

clean: ## Clean logs and screenshots
	rm -rf logs/* screenshots/*
	echo "Cleaned logs and screenshots directories"

clean-all: clean ## Clean everything including node_modules
	rm -rf node_modules
	echo "Cleaned all generated files"

setup: ## Initial setup (install + copy env)
	cp .env.example .env
	npm install
	mkdir -p logs screenshots
	echo "Setup complete! Please edit .env file with your configuration"
