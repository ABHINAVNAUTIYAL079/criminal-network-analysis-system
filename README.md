# Crime Network Intelligence System

An investigation-support platform for crime network analysis, entity resolution, knowledge graph visualization, and anomaly detection.

## Quick Start — Python Backend Setup

### 1. Prerequisites
- Python 3.10+
- (Optional) Neo4j 5.x running locally or via Docker (`bolt://localhost:7687`)

### 2. Environment Setup (Windows / Linux / macOS)

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt

# Download spaCy English NER model
python -m spacy download en_core_web_sm
```

### 3. Initialize Admin & Seed Sample Data

```bash
# Set environment variable (or copy .env.example to .env)
# On Windows (cmd):
set JWT_SECRET=your-32-character-secret-key-here
# On Windows (PowerShell):
$env:JWT_SECRET="your-32-character-secret-key-here"
# On Linux/macOS:
export JWT_SECRET="your-32-character-secret-key-here"

# Create initial admin user
python scripts/create_admin.py admin@crimenet.local --name "Administrator"

# Generate synthetic dataset
python scripts/generate_data.py --seed 42 --out-dir data/sample
```

### 4. Start FastAPI Backend

```bash
# Run server with uvicorn
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be available at `http://localhost:8000/api/docs`.
