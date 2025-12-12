#!/bin/bash

# Cleanup script for logs and screenshots

echo "🧹 Cleanup Script"
echo ""

# Function to get directory size
get_size() {
    du -sh "$1" 2>/dev/null | cut -f1
}

# Function to count files
count_files() {
    find "$1" -type f 2>/dev/null | wc -l | tr -d ' '
}

# Show current state
echo "Current state:"
if [ -d "logs" ]; then
    echo "  Logs: $(get_size logs) ($(count_files logs) files)"
fi
if [ -d "screenshots" ]; then
    echo "  Screenshots: $(get_size screenshots) ($(count_files screenshots) files)"
fi
echo ""

# Confirm
read -p "Clean logs and screenshots? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

# Clean logs
if [ -d "logs" ]; then
    echo "Cleaning logs..."
    rm -f logs/*.log
    echo "✅ Logs cleaned"
fi

# Clean screenshots
if [ -d "screenshots" ]; then
    echo "Cleaning screenshots..."
    rm -f screenshots/*.png
    echo "✅ Screenshots cleaned"
fi

echo ""
echo "✨ Cleanup complete!"
