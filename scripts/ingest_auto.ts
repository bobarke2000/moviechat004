// /scripts/ingest_auto.ts
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { parse } from 'json2csv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env.local');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("✅ Loaded environment from .env.local");
} else {
  dotenv.config();
  console.log("✅ Loaded environment from .env");
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHTML(url: string): Promise<string> {
  console.log(`🔍 Fetching HTML from: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  console.log(`✅ Received HTML from: ${url}`);
  return await res.text();
}

function parseMainPage(html: string) {
  console.log("🧠 Parsing main film listing page...");
  const $ = cheerio.load(html);
  const films: { title: string; link: string; image: string; director: string; country: string; year: string }[] = [];

  $('tr.criterion-channel__tr').each((_, row) => {
    const $row = $(row);
    const link = $row.attr('data-href') || '';
    const title = $row.find('td.criterion-channel__td--title').text().trim();
    const image = $row.find('img.criterion-channel__film-img').attr('src') || '';
    const director = $row.find('td.criterion-channel__td--director').text().trim();
    const country = $row.find('td.criterion-channel__td--country').text().trim();
    const year = $row.find('td.criterion-channel__td--year').text().trim();

    if (title && link && image) {
      films.push({ title, link, image, director, country, year });
    }
  });

  console.log(`✅ Found ${films.length} films`);
  return films;
}

async function getFilmDescription(url: string): Promise<string> {
  try {
    console.log(`🔎 Fetching film detail page: ${url}`);
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const description = $('meta[name="description"]').attr('content') || '';
    return description.trim();
  } catch (err) {
    console.error(`❌ Error fetching detail page for ${url}:`, err);
    return '';
  }
}

async function saveToCSV(data: any[], outputPath: string) {
  try {
    const csv = parse(data);
    writeFileSync(outputPath, csv);
    console.log(`💾 Saved CSV to ${outputPath}`);
  } catch (err) {
    console.error("❌ Error saving CSV:", err);
  }
}

function saveToJSON(data: any[], outputPath: string) {
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`💾 Saved vectors JSON to ${outputPath}`);
}

function loadFromJSON(inputPath: string) {
  const raw = readFileSync(inputPath, 'utf-8');
  return JSON.parse(raw);
}

async function uploadVectorsToPinecone(vectors: any[]) {
  console.log(`📌 Using Pinecone index: ${process.env.PINECONE_INDEX}`);
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pinecone.index(process.env.PINECONE_INDEX!);

  console.log(`⬆️ Preparing to upload ${vectors.length} vectors to Pinecone in batches...`);
  const batchSize = 100;
  for (let j = 0; j < vectors.length; j += batchSize) {
    const batch = vectors.slice(j, j + batchSize);
    console.log(`🚚 Uploading batch ${j / batchSize + 1} (${batch.length} vectors)...`);
    await index.upsert(batch);
  }
  console.log('✅ Upload complete.');
}


async function main() {
  console.log("🚀 Starting ingest script...");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const mainPageHTML = await fetchHTML('https://films.criterionchannel.com');
  const films = parseMainPage(mainPageHTML);

  const vectors = [];
  const scrapedData = [];
  let i = 0;

  for (const film of films) {
    console.log(`📽 Processing film: ${film.title}`);
    const description = await getFilmDescription(film.link);
    await delay(500);

    scrapedData.push({ ...film, description });

    const text = `Title: ${film.title}\nDirector: ${film.director}\nCountry: ${film.country}\nYear: ${film.year}\nDescription: ${description}`;

    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    vectors.push({
      id: `film-${i++}`,
      values: embedding.data[0].embedding,
      metadata: { ...film, description },
    });
  }

  await saveToCSV(scrapedData, resolve(__dirname, '../scraped_films.csv'));
  saveToJSON(vectors, resolve(__dirname, '../vectors.json'));

  await uploadVectorsToPinecone(vectors);
}

async function uploadOnly() {
  const vectors = loadFromJSON(resolve(__dirname, '../vectors.json'));
  await uploadVectorsToPinecone(vectors);
}

if (process.argv.includes('--upload-only')) {
  uploadOnly().catch(err => {
    console.error('❌ Error during upload:', err);
    process.exit(1);
  });
} else {
  main().catch(err => {
    console.error('❌ Error during ingest:', err);
    process.exit(1);
  });
}
