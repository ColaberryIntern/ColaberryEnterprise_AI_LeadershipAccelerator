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

/**
 * Authored catalog (constant, not user input) of notable AI/ML tools. Grown from
 * the original ~24 to ~80 (2026-08-10, content-supply fix): at
 * AI_TOOL_OF_THE_DAY_MAX_PER_RUN=2/day, a 24-item list fully exhausts in ~12 days,
 * then goes silent for the rest of the 30-day retention window before any item
 * ages out and becomes re-eligible — an unavoidable ~18-day dead zone regardless
 * of the retention mechanism working correctly. ~80 items / 2 per day = ~40 days
 * to first exhaustion, which comfortably exceeds the 30-day retention window, so
 * the oldest cards start recycling before the list itself runs dry — no gap.
 * See generatedContentRetention.ts for the recycle mechanism this depends on.
 */
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
  { name: 'AutoGen', url: 'https://microsoft.github.io/autogen', what: "Microsoft's framework for building multi-agent LLM conversations and workflows." },
  { name: 'CrewAI', url: 'https://www.crewai.com', what: 'Framework for orchestrating role-playing autonomous AI agents as a coordinated crew.' },
  { name: 'Semantic Kernel', url: 'https://github.com/microsoft/semantic-kernel', what: "Microsoft's SDK for blending LLM calls with conventional code and plugins." },
  { name: 'Langflow', url: 'https://www.langflow.org', what: 'Visual, drag-and-drop builder for LangChain-based LLM flows and agents.' },
  { name: 'Flowise', url: 'https://flowiseai.com', what: 'Open-source low-code UI for building customized LLM workflows.' },
  { name: 'n8n', url: 'https://n8n.io', what: 'Fair-code workflow automation tool with native AI agent and LLM nodes.' },
  { name: 'Streamlit', url: 'https://streamlit.io', what: 'Python framework for turning data/ML scripts into shareable web apps quickly.' },
  { name: 'Gradio', url: 'https://www.gradio.app', what: 'Python library for building quick web demos and UIs around ML models.' },
  { name: 'MLflow', url: 'https://mlflow.org', what: 'Open-source platform for the ML lifecycle: tracking, packaging, and deployment.' },
  { name: 'Kubeflow', url: 'https://www.kubeflow.org', what: 'Toolkit for running portable, scalable ML workflows on Kubernetes.' },
  { name: 'Apache Airflow', url: 'https://airflow.apache.org', what: 'Platform for authoring, scheduling, and monitoring data and ML pipelines as code.' },
  { name: 'DVC', url: 'https://dvc.org', what: 'Git-like version control for datasets, models, and ML experiments.' },
  { name: 'Comet', url: 'https://www.comet.com', what: 'Experiment tracking and model production monitoring platform for ML teams.' },
  { name: 'Neptune.ai', url: 'https://neptune.ai', what: 'Metadata store for MLOps, built for tracking large numbers of experiments.' },
  { name: 'Label Studio', url: 'https://labelstud.io', what: 'Open-source data labeling tool for text, image, audio, and video annotation.' },
  { name: 'Argilla', url: 'https://argilla.io', what: 'Open-source tool for curating and labeling data for LLMs and NLP models.' },
  { name: 'spaCy', url: 'https://spacy.io', what: 'Industrial-strength open-source library for production natural language processing.' },
  { name: 'FAISS', url: 'https://github.com/facebookresearch/faiss', what: "Meta's library for efficient similarity search over dense vector embeddings." },
  { name: 'Milvus', url: 'https://milvus.io', what: 'Open-source vector database built for scalable similarity search.' },
  { name: 'Qdrant', url: 'https://qdrant.tech', what: 'Open-source vector search engine and database with a focus on filtering.' },
  { name: 'Vercel AI SDK', url: 'https://sdk.vercel.ai', what: 'TypeScript toolkit for building AI-powered streaming UI applications.' },
  { name: 'OpenAI API', url: 'https://platform.openai.com', what: "OpenAI's developer API for GPT models, embeddings, and tool use." },
  { name: 'Anthropic API', url: 'https://docs.claude.com', what: "Anthropic's developer API for Claude models, including tool use and vision." },
  { name: 'Google AI Studio', url: 'https://aistudio.google.com', what: "Google's free web tool for prototyping with Gemini models and prompts." },
  { name: 'AWS Bedrock', url: 'https://aws.amazon.com/bedrock', what: "Amazon's managed service offering multiple foundation models via one API." },
  { name: 'Vertex AI', url: 'https://cloud.google.com/vertex-ai', what: "Google Cloud's unified platform for training, tuning, and serving ML models." },
  { name: 'Amazon SageMaker', url: 'https://aws.amazon.com/sagemaker', what: "AWS's fully managed service for building, training, and deploying ML models." },
  { name: 'NeMo Guardrails', url: 'https://github.com/NVIDIA/NeMo-Guardrails', what: "NVIDIA's open-source toolkit for adding programmable guardrails to LLM apps." },
  { name: 'Langfuse', url: 'https://langfuse.com', what: 'Open-source LLM observability platform for tracing, evals, and prompt management.' },
  { name: 'Arize AI', url: 'https://arize.com', what: 'ML and LLM observability platform for monitoring model and prompt performance.' },
  { name: 'Braintrust', url: 'https://www.braintrust.dev', what: 'Evaluation and observability platform for iterating on LLM applications.' },
  { name: 'Humanloop', url: 'https://humanloop.com', what: 'Platform for prompt management, evaluation, and monitoring of LLM products.' },
  { name: 'Promptfoo', url: 'https://www.promptfoo.dev', what: 'Open-source CLI/library for testing and evaluating LLM prompts and outputs.' },
  { name: 'Ragas', url: 'https://docs.ragas.io', what: 'Open-source framework for evaluating retrieval-augmented generation pipelines.' },
  { name: 'TruLens', url: 'https://www.trulens.org', what: 'Open-source library for evaluating and tracking LLM app quality over time.' },
  { name: 'Marqo', url: 'https://www.marqo.ai', what: 'Open-source vector search engine with built-in embedding generation.' },
  { name: 'Typesense', url: 'https://typesense.org', what: 'Open-source, typo-tolerant search engine with vector search support.' },
  { name: 'Meilisearch', url: 'https://www.meilisearch.com', what: 'Fast, open-source search engine with hybrid keyword and semantic search.' },
  { name: 'Tavily', url: 'https://tavily.com', what: 'Search API purpose-built for feeding real-time web results to LLM agents.' },
  { name: 'Browserbase', url: 'https://www.browserbase.com', what: 'Headless browser infrastructure built for AI agents to browse and act on the web.' },
  { name: 'AgentOps', url: 'https://www.agentops.ai', what: 'Observability and monitoring platform purpose-built for AI agent runs.' },
  { name: 'Portkey', url: 'https://portkey.ai', what: 'AI gateway for routing, caching, and observing calls across many LLM providers.' },
  { name: 'OpenRouter', url: 'https://openrouter.ai', what: 'Unified API routing requests across dozens of LLM providers and models.' },
  { name: 'Fireworks AI', url: 'https://fireworks.ai', what: 'Fast inference platform for serving and fine-tuning open-source models.' },
  { name: 'Baseten', url: 'https://www.baseten.co', what: 'Platform for deploying and serving custom ML models in production.' },
  { name: 'Anyscale', url: 'https://www.anyscale.com', what: 'Managed platform for running Ray workloads for large-scale ML and AI.' },
  { name: 'RunPod', url: 'https://www.runpod.io', what: 'On-demand GPU cloud for training and running AI/ML workloads.' },
  { name: 'Google Colab', url: 'https://colab.research.google.com', what: "Google's free hosted Jupyter notebook environment with GPU/TPU access." },
  { name: 'Kaggle', url: 'https://www.kaggle.com', what: 'Data science community platform with datasets, notebooks, and competitions.' },
  { name: 'GitHub Copilot', url: 'https://github.com/features/copilot', what: "GitHub's AI pair programmer offering inline code completion and chat." },
  { name: 'Amazon Q Developer', url: 'https://aws.amazon.com/q/developer', what: "AWS's AI coding assistant for building, testing, and troubleshooting in the cloud." },
  { name: 'Tabnine', url: 'https://www.tabnine.com', what: 'AI code completion tool with an emphasis on private, self-hosted deployment.' },
  { name: 'Sourcegraph Cody', url: 'https://sourcegraph.com/cody', what: 'AI coding assistant with deep, whole-codebase context for large repos.' },
  { name: 'Windsurf', url: 'https://windsurf.com', what: 'AI-native IDE (by Codeium) built around agentic, multi-file code editing.' },
  { name: 'v0', url: 'https://v0.dev', what: "Vercel's AI tool that generates React UI components from natural-language prompts." },
  { name: 'ElevenLabs', url: 'https://elevenlabs.io', what: 'AI voice platform for realistic text-to-speech and voice cloning.' },
  { name: 'Suno', url: 'https://suno.com', what: 'AI music generation tool that creates full songs from text prompts.' },
  { name: 'Runway', url: 'https://runwayml.com', what: 'AI video generation and editing platform used widely in creative production.' },
  { name: 'Midjourney', url: 'https://www.midjourney.com', what: 'AI image generation tool known for stylized, artistic output from text prompts.' },
  { name: 'Stable Diffusion', url: 'https://stability.ai', what: "Stability AI's open-weight text-to-image diffusion model family." },
  { name: 'HeyGen', url: 'https://www.heygen.com', what: 'AI platform for generating talking-avatar videos from text or audio.' },
  { name: 'Descript', url: 'https://www.descript.com', what: 'AI-powered audio/video editor that lets you edit media by editing a transcript.' },
  { name: 'Notion AI', url: 'https://www.notion.com/product/ai', what: "Notion's built-in AI assistant for writing, summarizing, and Q&A over docs." },
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
