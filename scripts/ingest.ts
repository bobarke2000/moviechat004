// scripts/ingest.ts
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { OpenAI } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

// Get proper __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local if it exists
const envPath = resolve(__dirname, '../.env.local');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("Loaded environment from .env.local");
} else {
  // Fallback to regular .env
  dotenv.config();
  console.log("Loaded environment from .env");
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url);
  return await res.text();
}

function extractText(html: string): string {
  const $ = cheerio.load(html);
  const rows = $("tr");
  let entries: string[] = [];

  rows.each((_, row) => {
    const $row = $(row);
    const imageUrl = $row.find("td img").attr("src");
    const link = $row.find("td a").attr("href");
    const titleBlock = $row.find("td").eq(1).text().trim();
    const description = $row.find("td").eq(2).text().trim();

    if (link && titleBlock && description && imageUrl) {
      const fullImageUrl = `https://cchannel.nfshost.com${imageUrl}`;
      const fullLink = link.startsWith("http") ? link : `https://www.criterionchannel.com${link}`;

      entries.push(`Title: ${titleBlock}
Image: ${fullImageUrl}
Link: ${fullLink}
Description: ${description}
---`);
    }
  });

  return entries.join("\n\n");
}


function chunkText(text: string, maxChunkLength = 1000): string[] {
  const sentences = text.split(/(?<=[.?!])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > maxChunkLength) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence + " ";
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

async function main() {
  // Print all environment variables for debugging (hide sensitive values)
  console.log("Environment variables:");
  console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ Set" : "❌ Not set");
  console.log("PINECONE_API_KEY:", process.env.PINECONE_API_KEY ? "✅ Set" : "❌ Not set");
  console.log("PINECONE_INDEX:", process.env.PINECONE_INDEX ? `✅ Set to "${process.env.PINECONE_INDEX}"` : "❌ Not set");

  // Check if required environment variables are set
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env.local file");
  }
  if (!process.env.PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY is not set in .env.local file");
  }
  if (!process.env.PINECONE_INDEX) {
    throw new Error("PINECONE_INDEX is not set in .env.local file");
  }

  const url = "https://cchannel.nfshost.com/";
  console.log(`Fetching content from ${url}...`);
  const html = await fetchPage(url);
  const text = extractText(html);
  console.log(`Extracted ${text.length} characters of text`);
  
  const chunks = chunkText(text);
  console.log(`Split text into ${chunks.length} chunks`);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  console.log("Generating embeddings...");
  const vectors = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunk,
    });
    
    vectors.push({
      id: `chunk-${i}`,
      values: embedding.data[0].embedding,
      metadata: { text: chunk, source: url },
    });
    
    if (i % 5 === 0 && i > 0) {
      console.log(`Processed ${i}/${chunks.length} chunks`);
    }
  }

  // In your ingest.ts file, replace the upsert section with this batched version

// ...previous code remains the same...

  console.log("Connecting to Pinecone...");
  // Updated Pinecone initialization for v2.0.0+
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
  });
  
  const index = pc.index(process.env.PINECONE_INDEX);
  
  // Batch vectors for upsert (100 vectors per batch)
  const batchSize = 100;
  const batches = [];
  
  for (let i = 0; i < vectors.length; i += batchSize) {
    batches.push(vectors.slice(i, i + batchSize));
  }
  
  console.log(`Upserting ${vectors.length} vectors to Pinecone in ${batches.length} batches...`);
  
  // Upsert each batch
  let batchCounter = 0;
  for (const batch of batches) {
    batchCounter++;
    console.log(`Upserting batch ${batchCounter}/${batches.length} (${batch.length} vectors)...`);
    await index.upsert(batch);
  }
  
  console.log(`✅ Successfully seeded ${vectors.length} vectors into Pinecone.`);
}

main().catch((err) => {
  console.error("❌ Error during seeding:", err);
  process.exit(1);
});