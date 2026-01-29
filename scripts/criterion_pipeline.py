"""
Criterion Channel Pipeline
Scrapes films.criterionchannel.com, generates OpenAI embeddings,
and uploads vectors to Pinecone for RAG retrieval.

Designed to run monthly via cron on a Raspberry Pi.

Usage:
    python scripts/criterion_pipeline.py

Cron (1st of each month at 3 AM):
    0 3 1 * * /path/to/.venv/bin/python /path/to/scripts/criterion_pipeline.py >> /path/to/logs/cron.log 2>&1
"""

import os
import sys
import time
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from openai import OpenAI
from pinecone import Pinecone
from dotenv import load_dotenv

# --- Constants ---

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
LOG_DIR = PROJECT_ROOT / "logs"
LOG_FILE = LOG_DIR / "criterion_pipeline.log"

MAIN_URL = "https://films.criterionchannel.com"
REQUEST_TIMEOUT = 30
DETAIL_DELAY = 0.5
MAX_RETRIES = 3
PINECONE_BATCH_SIZE = 100


# --- Logging ---

def setup_logging():
    LOG_DIR.mkdir(exist_ok=True)

    handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
    )
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))

    logger = logging.getLogger("criterion_pipeline")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.addHandler(logging.StreamHandler(sys.stdout))
    return logger


# --- Configuration ---

def load_config(logger):
    env_local = PROJECT_ROOT / ".env.local"
    env_default = PROJECT_ROOT / ".env"

    if env_local.exists():
        load_dotenv(dotenv_path=env_local)
        logger.info(f"Loaded environment from {env_local}")
    elif env_default.exists():
        load_dotenv(dotenv_path=env_default)
        logger.info(f"Loaded environment from {env_default}")
    else:
        logger.error("No .env.local or .env file found")
        sys.exit(1)

    required = ["OPENAI_API_KEY", "PINECONE_API_KEY", "PINECONE_INDEX"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        logger.error(f"Missing required env vars: {', '.join(missing)}")
        sys.exit(1)

    logger.info(f"Config validated. PINECONE_INDEX={os.getenv('PINECONE_INDEX')}")


# --- HTTP ---

def fetch_html(url, logger):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(
                url,
                timeout=REQUEST_TIMEOUT,
                headers={"User-Agent": "CriterionPipelineBot/1.0"},
            )
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            logger.warning(f"Fetch attempt {attempt}/{MAX_RETRIES} failed for {url}: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)
            else:
                raise


# --- Scraping ---

def scrape_main_page(logger):
    logger.info(f"Fetching main page: {MAIN_URL}")
    html = fetch_html(MAIN_URL, logger)
    soup = BeautifulSoup(html, "html.parser")

    films = []
    for row in soup.select("tr.criterion-channel__tr"):
        title_td = row.select_one("td.criterion-channel__td--title")
        title = title_td.get_text(strip=True) if title_td else ""

        link = row.get("data-href", "")

        img_tag = row.select_one("img.criterion-channel__film-img")
        image = img_tag.get("src", "") if img_tag else ""

        director_td = row.select_one("td.criterion-channel__td--director")
        director = director_td.get_text(strip=True) if director_td else ""

        country_td = row.select_one("td.criterion-channel__td--country")
        country = country_td.get_text(strip=True) if country_td else ""

        year_td = row.select_one("td.criterion-channel__td--year")
        year = year_td.get_text(strip=True) if year_td else ""

        if title and link and image:
            films.append({
                "title": title,
                "link": link,
                "image": image,
                "director": director,
                "country": country,
                "year": year,
            })

    logger.info(f"Found {len(films)} films on main page")
    return films


def scrape_film_detail(film, logger):
    url = film["link"]
    try:
        html = fetch_html(url, logger)
        soup = BeautifulSoup(html, "html.parser")

        meta_desc = soup.select_one('meta[name="description"]')
        description = meta_desc.get("content", "").strip() if meta_desc else ""

        duration_el = soup.select_one(".duration-container")
        duration = duration_el.get_text(strip=True) if duration_el else ""

        return {"description": description, "duration": duration}
    except Exception as e:
        logger.error(f"Error fetching detail for {film['title']} ({url}): {e}")
        return {"description": "", "duration": ""}


# --- Embedding ---

def generate_embedding(client, text, logger):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
            )
            return response.data[0].embedding
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "rate" in error_str.lower():
                wait = 2 ** attempt * 5
                logger.warning(f"Rate limited, waiting {wait}s (attempt {attempt})")
                time.sleep(wait)
            else:
                logger.warning(f"Embedding attempt {attempt}/{MAX_RETRIES} failed: {e}")
                if attempt < MAX_RETRIES:
                    time.sleep(2 ** attempt)
                else:
                    raise
    return None


# --- Pinecone Upload ---

def upload_to_pinecone(vectors, logger):
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(os.getenv("PINECONE_INDEX"))

    total_batches = (len(vectors) + PINECONE_BATCH_SIZE - 1) // PINECONE_BATCH_SIZE
    logger.info(f"Uploading {len(vectors)} vectors in {total_batches} batches")

    for batch_num in range(total_batches):
        start = batch_num * PINECONE_BATCH_SIZE
        batch = vectors[start:start + PINECONE_BATCH_SIZE]

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                index.upsert(vectors=batch)
                logger.info(f"Uploaded batch {batch_num + 1}/{total_batches} ({len(batch)} vectors)")
                break
            except Exception as e:
                logger.warning(f"Upsert attempt {attempt}/{MAX_RETRIES} failed: {e}")
                if attempt < MAX_RETRIES:
                    time.sleep(2 ** attempt)
                else:
                    logger.error(f"Failed to upload batch {batch_num + 1} after {MAX_RETRIES} attempts")
                    raise


# --- Main ---

def main():
    logger = setup_logging()
    logger.info("=" * 60)
    logger.info("Starting Criterion Channel pipeline")
    logger.info("=" * 60)

    load_config(logger)

    # Step 1: Scrape main page
    films = scrape_main_page(logger)
    if not films:
        logger.error("No films found. Aborting.")
        sys.exit(1)

    # Step 2: Scrape details + generate embeddings
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    vectors = []
    failed_details = 0
    failed_embeddings = 0

    for i, film in enumerate(films):
        logger.info(f"Processing {i + 1}/{len(films)}: {film['title']}")

        details = scrape_film_detail(film, logger)
        if not details["description"]:
            failed_details += 1

        film["description"] = details["description"]
        film["duration"] = details["duration"]

        time.sleep(DETAIL_DELAY)

        input_text = (
            f"Title: {film['title']}\n"
            f"Director: {film['director']}\n"
            f"Country: {film['country']}\n"
            f"Year: {film['year']}\n"
            f"Description: {film['description']}"
        )

        try:
            embedding = generate_embedding(openai_client, input_text, logger)
            if embedding is None:
                failed_embeddings += 1
                continue

            vectors.append({
                "id": f"film-{i}",
                "values": embedding,
                "metadata": {
                    "title": film["title"],
                    "link": film["link"],
                    "image": film["image"],
                    "director": film["director"],
                    "country": film["country"],
                    "year": film["year"],
                    "description": film["description"],
                    "runtime": film["duration"],
                },
            })
        except Exception as e:
            logger.error(f"Failed to embed '{film['title']}': {e}")
            failed_embeddings += 1

    logger.info(
        f"Embedding complete: {len(vectors)} succeeded, "
        f"{failed_details} detail failures, "
        f"{failed_embeddings} embedding failures"
    )

    if not vectors:
        logger.error("No vectors generated. Aborting upload.")
        sys.exit(1)

    # Step 3: Upload to Pinecone
    upload_to_pinecone(vectors, logger)

    logger.info("=" * 60)
    logger.info(f"Pipeline complete. {len(vectors)} vectors uploaded.")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
