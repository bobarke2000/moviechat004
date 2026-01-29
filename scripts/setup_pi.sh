#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$PROJECT_ROOT/.venv"

echo "Setting up Criterion Pipeline on Raspberry Pi"
echo ""

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found."
    echo "Install with: sudo apt-get install python3 python3-pip python3-venv"
    exit 1
fi

# Create virtual environment
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR"
    python3 -m venv "$VENV_DIR"
else
    echo "Virtual environment already exists at $VENV_DIR"
fi

# Install dependencies
echo "Installing Python dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"

# Check for .env.local
if [ ! -f "$PROJECT_ROOT/.env.local" ]; then
    echo ""
    echo "WARNING: .env.local not found at $PROJECT_ROOT/.env.local"
    echo "Create it with your OPENAI_API_KEY, PINECONE_API_KEY, and PINECONE_INDEX."
fi

echo ""
echo "Setup complete."
echo ""
echo "To run manually:"
echo "  $VENV_DIR/bin/python $SCRIPT_DIR/criterion_pipeline.py"
echo ""
echo "To set up monthly cron (1st of each month at 3 AM):"
echo "  crontab -e"
echo "  0 3 1 * * $VENV_DIR/bin/python $SCRIPT_DIR/criterion_pipeline.py >> $PROJECT_ROOT/logs/cron.log 2>&1"
