import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "@/config/env";

export const qdrant = new QdrantClient({
  url: env.QDRANT_URL,
  ...(env.QDRANT_API_KEY ? { apiKey: env.QDRANT_API_KEY } : {}),
});
