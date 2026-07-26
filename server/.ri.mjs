const { runIngestion } = await import("./src/ingestion/pipeline.ts");
await runIngestion(process.argv[2], true);
