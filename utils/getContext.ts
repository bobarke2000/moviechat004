import { OpenAI } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

export async function getContext(query: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const vector = embedding.data[0].embedding;

  if (!process.env.PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY is not defined in the environment variables.");
  }
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pinecone.index(process.env.PINECONE_INDEX!);

  const results = await index.query({
    vector,
    topK: 5,
    includeMetadata: true,
  });

  return results.matches
    .map((match) => match.metadata?.text || "")
    .filter(Boolean)
    .join("\n\n");
}
