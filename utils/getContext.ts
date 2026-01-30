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
  const index = process.env.PINECONE_HOST
    ? pinecone.index(process.env.PINECONE_INDEX!, process.env.PINECONE_HOST)
    : pinecone.index(process.env.PINECONE_INDEX!);

  const results = await index.query({
    vector,
    topK: 20,
    includeMetadata: true,
  });

  return results.matches
    .map((match) => {
      const meta = match.metadata as any;
      return `**${meta.title}**
${meta.description}

Duration: ${meta.runtime || "N/A"}  
![Poster](${meta.image})  
[Watch on Criterion Channel](${meta.link})`;
    })
    .join("\n\n");
}
