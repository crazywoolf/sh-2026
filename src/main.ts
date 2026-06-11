import { buildServer } from "./server.ts";
import { buildAgents } from "./wiring.ts";
import { runPipeline } from "./orchestrator.ts";
import { createLLMClient } from "./llm/client.ts";

const agents = buildAgents(createLLMClient());
const app = buildServer((q) => runPipeline(agents, q));
const port = Number(process.env.PORT ?? 8000);

app.listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`Meridian agents on :${port}`))
  .catch((e) => { console.error(e); process.exit(1); });
