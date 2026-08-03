/**
 * ai_tool_of_the_day — CURATED intel source: one notable AI/ML tool per run.
 *
 * collect() returns a static, authored catalog of well-known tools as seed items.
 * It does NOT fetch and NEVER throws. The engine dedups on (pipeline, guid) and,
 * for a rotating "tool of the day" type, ages each tool out before re-carding it,
 * so the guid MUST be stable per tool — hence `tool:<slug-of-name>`.
 *
 * The LLM does the actual writing (resolved from the ai_tool_of_the_day generation
 * prompt by slug); collect() only supplies name + url + a one-line what-it-is.
 */
import { NormalizedIntelItem, registerIntelSource } from '../intelRegistry';
import { toSlug } from './idUtils';

const SLUG = 'ai_tool_of_the_day';
const SOURCE = 'Curated';

interface CuratedTool {
  name: string;
  url: string;
  what: string; // one-line "what it is"
}

/** Authored catalog (constant, not user input) of ~24 notable AI/ML tools. */
const TOOLS: readonly CuratedTool[] = [
  { name: 'Cursor', url: 'https://cursor.com', what: 'AI-native code editor built on VS Code with repo-aware autocomplete and chat.' },
  { name: 'Claude Code', url: 'https://claude.com/claude-code', what: "Anthropic's agentic command-line coding tool that plans, edits, and runs your codebase." },
  { name: 'LangChain', url: 'https://www.langchain.com', what: 'Framework for composing LLM calls, tools, and memory into chains and agents.' },
  { name: 'LlamaIndex', url: 'https://www.llamaindex.ai', what: 'Data framework connecting LLMs to private data via indexing and retrieval.' },
  { name: 'Ollama', url: 'https://ollama.com', what: 'Run open-weight LLMs locally with a single command and a simple API.' },
  { name: 'vLLM', url: 'https://github.com/vllm-project/vllm', what: 'High-throughput LLM inference and serving engine using PagedAttention.' },
  { name: 'Weights & Biases', url: 'https://wandb.ai', what: 'Experiment tracking, model versioning, and evaluation for ML teams.' },
  { name: 'DSPy', url: 'https://dspy.ai', what: 'Framework for programming (not prompting) LLMs with optimizable modules.' },
  { name: 'Pinecone', url: 'https://www.pinecone.io', what: 'Managed vector database for semantic search and RAG at scale.' },
  { name: 'Weaviate', url: 'https://weaviate.io', what: 'Open-source vector database with built-in hybrid search and modules.' },
  { name: 'Chroma', url: 'https://www.trychroma.com', what: 'Lightweight open-source embedding database for building AI apps.' },
  { name: 'Hugging Face Transformers', url: 'https://huggingface.co/docs/transformers', what: 'Library of pretrained models and pipelines for NLP, vision, and audio.' },
  { name: 'PyTorch', url: 'https://pytorch.org', what: 'Deep-learning framework with dynamic graphs, the default for research.' },
  { name: 'Ray', url: 'https://www.ray.io', what: 'Distributed compute framework for scaling Python and ML workloads.' },
  { name: 'LangGraph', url: 'https://www.langchain.com/langgraph', what: 'Library for building stateful, multi-actor LLM agents as graphs.' },
  { name: 'Modal', url: 'https://modal.com', what: 'Serverless cloud for running Python, GPUs, and AI workloads without infra.' },
  { name: 'Replicate', url: 'https://replicate.com', what: 'Run and fine-tune open-source models through a hosted API.' },
  { name: 'Together AI', url: 'https://www.together.ai', what: 'Inference and fine-tuning platform for open models at scale.' },
  { name: 'Groq', url: 'https://groq.com', what: 'LPU-based inference hardware delivering very low-latency LLM responses.' },
  { name: 'LiteLLM', url: 'https://www.litellm.ai', what: 'Unified proxy calling 100+ LLM providers with one OpenAI-style interface.' },
  { name: 'Haystack', url: 'https://haystack.deepset.ai', what: 'Open-source framework for production RAG and search pipelines.' },
  { name: 'Instructor', url: 'https://python.useinstructor.com', what: 'Structured, validated LLM outputs via Pydantic type coercion.' },
  { name: 'Guardrails AI', url: 'https://www.guardrailsai.com', what: 'Validation and correction layer enforcing structure and safety on LLM output.' },
  { name: 'LangSmith', url: 'https://smith.langchain.com', what: 'Tracing, evaluation, and observability platform for LLM applications.' },
];

/** Curated: return the authored catalog as normalized seed items. Never throws. */
export async function collect(): Promise<NormalizedIntelItem[]> {
  try {
    const seen = new Set<string>();
    const items: NormalizedIntelItem[] = [];
    for (const t of TOOLS) {
      const guid = `tool:${toSlug(t.name)}`;
      if (seen.has(guid)) continue; // guard against an accidental duplicate name
      seen.add(guid);
      items.push({ guid, source: SOURCE, title: t.name, url: t.url, excerpt: t.what, publishedAt: null });
    }
    return items;
  } catch {
    // Curated data can't realistically throw, but the contract is absolute:
    // collect() never throws. Worst case is an empty run, never a crash.
    return [];
  }
}

registerIntelSource({
  slug: SLUG,
  label: 'AI Tool of the Day',
  enableEnv: 'AI_TOOL_OF_THE_DAY_INGEST_ENABLED',
  maxPerRunEnv: 'AI_TOOL_OF_THE_DAY_MAX_PER_RUN',
  collect,
});
