import os
import json
import math
import pandas as pd
from tqdm import tqdm
from openai import OpenAI
from dotenv import load_dotenv
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s — %(levelname)s — %(message)s'
)

# Load .env.local from the root
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(dotenv_path=env_path)
logging.info(f"Loaded environment variables from {env_path}")

# Initialize OpenAI client
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    logging.error("Missing OPENAI_API_KEY in environment.")
    exit(1)

openai = OpenAI(api_key=api_key)

# Load cleaned CSV
csv_path = os.path.join(os.path.dirname(__file__), '..', 'scraped_films_cleaned.csv')
logging.info(f"Loading CSV from: {csv_path}")
df = pd.read_csv(csv_path)

# Limit to first 10 rows for test
# df = df.head(10)  ← remove or comment this out
logging.info(f"🔄 Generating vectors for {len(df)} test films...")

vectors = []

for i, row in tqdm(df.iterrows(), total=len(df), desc="Embedding"):
    try:
        # Replace NaNs with empty string
        metadata = {
            "title": str(row.get('title', '') or ''),
            "link": str(row.get('link', '') or ''),
            "image": str(row.get('image', '') or ''),
            "director": str(row.get('director', '') or ''),
            "country": str(row.get('country', '') or ''),
            "year": str(row.get('year', '') or ''),
            "description": str(row.get('description', '') or '')
        }

        text = f"""Title: {metadata['title']}
Director: {metadata['director']}
Country: {metadata['country']}
Year: {metadata['year']}
Description: {metadata['description']}"""

        response = openai.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        embedding = response.data[0].embedding

        if any(math.isnan(x) for x in embedding):
            logging.warning(f"⚠️ Skipping {metadata['title']} due to NaN in embedding")
            continue

        vectors.append({
            "id": f"film-{i}",
            "values": embedding,
            "metadata": metadata
        })

        logging.info(f"✅ Embedded: {metadata['title']}")

    except Exception as e:
        logging.error(f"❌ Error processing {row.get('title', '[UNKNOWN]')}: {e}")

# Save vectors.json
output_path = os.path.join(os.path.dirname(__file__), '..', 'vectors.json')
with open(output_path, 'w') as f:
    json.dump(vectors, f, indent=2)

logging.info(f"✅ Saved {len(vectors)} vectors to {output_path}")
