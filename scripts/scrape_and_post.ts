// /scripts/ingestPipeline.ts
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
console.log("✅ Loaded environment variables");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index(process.env.PINECONE_INDEX!);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchHTML(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.text();
}

function parseMainPage(html: string) {
  const $ = cheerio.load(html);
  const films: any[] = [];
  $('tr.criterion-channel__tr').each((_, row) => {
    const $row = $(row);
    const title = $row.find('td.criterion-channel__td--title').text().trim();
    const link = $row.attr('data-href') || '';
    const image = $row.find('img.criterion-channel__film-img').attr('src') || '';
    const director = $row.find('td.criterion-channel__td--director').text().trim();
    const country = $row.find('td.criterion-channel__td--country').text().trim();
    const year = $row.find('td.criterion-channel__td--year').text().trim();
    if (title && link && image) {
      films.push({ title, link, image, director, country, year });
    }
  });
  return films;
}

async function getFilmDescription(url: string): Promise<{ description: string; duration: string }> {
  try {
    console.log(`🔎 Fetching film detail page: ${url}`);
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const description = $('meta[name="description"]').attr('content')?.trim() || '';
    const duration = $('.duration-container').first().text().trim();

    return { description, duration };
  } catch (err) {
    console.error(`❌ Error fetching detail page for ${url}:`, err);
    return { description: '', duration: '' };
  }
}


async function main() {
  console.log("🚀 Starting scrape → embed → upload pipeline");
  const mainPageHTML = await fetchHTML('https://films.criterionchannel.com');
  const films = parseMainPage(mainPageHTML);
  const vectors = [];

  for (let i = 0; i < films.length; i++) {
    const film = films[i];
    console.log(`📽 Processing: ${film.title}`);
    const { description, duration } = await getFilmDescription(film.link);
    await delay(500);

    const metadata = { ...film, description };
    const inputText = `Title: ${film.title}\nDirector: ${film.director}\nCountry: ${film.country}\nYear: ${film.year}\nDescription: ${description}`;

    try {
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: inputText
      });

      vectors.push({
        id: `film-${i}`,
        values: embedding.data[0].embedding,
        metadata
      });
    } catch (e) {
      console.error(`❌ Failed embedding: ${film.title}`, e);
    }
  }

  console.log(`⬆️ Uploading ${vectors.length} vectors to Pinecone`);
  const batchSize = 100;
  for (let j = 0; j < vectors.length; j += batchSize) {
    const batch = vectors.slice(j, j + batchSize);
    await index.upsert(batch);
    console.log(`✅ Uploaded batch ${j / batchSize + 1}`);
  }

  console.log("🎉 All done!");
}

main().catch(err => {
  console.error("❌ Pipeline error:", err);
  process.exit(1);
});
