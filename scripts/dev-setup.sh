#!/bin/bash

# Development helper script

set -e

echo "🔧 Development Setup Helper"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js
if ! command_exists node; then
    echo "❌ Node.js is not installed"
    echo "Please install Node.js 18 or higher from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version $NODE_VERSION is too old"
    echo "Please upgrade to Node.js 18 or higher"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check npm
if ! command_exists npm; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ npm version: $(npm --version)"
echo ""

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created"
    echo "⚠️  Please edit .env and set your API_KEY"
else
    echo "✅ .env file exists"
fi

# Create directories
echo ""
echo "📁 Creating directories..."
mkdir -p logs screenshots
echo "✅ Directories created"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🎉 Development setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env file: nano .env"
echo "  2. Start dev server: npm run dev"
echo "  3. Test API: curl http://localhost:3000/health"
echo ""
