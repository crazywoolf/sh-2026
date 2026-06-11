import type { Agents } from "./orchestrator.ts";
import type { LLMClient } from "./llm/client.ts";
import { plan } from "./agents/planner.ts";
import { extract } from "./agents/extractor.ts";
import { analyze } from "./agents/analyst.ts";
import { critique } from "./agents/critic.ts";
import { visualize } from "./agents/visualizer.ts";

export function buildAgents(llm: LLMClient): Agents {
  return {
    plan: (q) => plan(llm, q),
    extract: (q) => extract(llm, q),
    analyze: (q, ext) => analyze(llm, q, ext),
    critique: (q, ext, ana) => critique(llm, q, ext, ana),
    visualize: (ana, ext) => visualize(llm, ana, ext),
  };
}
