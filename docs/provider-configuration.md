# Provider Configuration Guide

This guide covers how to configure LLM providers in Khadim, including API key setup, custom endpoints, and model selection best practices.

## Table of Contents

- [Quick Start](#quick-start)
- [Cloud Providers](#cloud-providers)
- [Aggregators & Gateways](#aggregators--gateways)
- [Enterprise Providers](#enterprise-providers)
- [Local Models with Ollama](#local-models-with-ollama)
- [Free Tier Models](#free-tier-models)
- [Model Selection Guide](#model-selection-guide)
- [Custom Base URLs](#custom-base-urls)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

1. Choose a provider from the list below
2. Get an API key from the provider's website
3. Set the environment variable (in `.env` or system environment)
4. Select the model in Khadim's settings

```bash
# Example: Using Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

## Cloud Providers

### OpenAI

**Models:** GPT-4o, GPT-4o Mini, o1, o1-mini

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** in the sidebar
4. Click **Create new secret key**
5. Copy the key (starts with `sk-`)

```bash
export OPENAI_API_KEY="sk-..."
```

**Recommended models:**
- `gpt-4o` — Best balance of speed and quality
- `gpt-4o-mini` — Faster, cheaper, good for simple tasks
- `o1` — Advanced reasoning, slower but more accurate

---

### Anthropic (Claude)

**Models:** Claude Sonnet 4, Claude 3.5 Haiku

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create an account or log in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-`)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**Recommended models:**
- `claude-sonnet-4-20250514` — Best for coding tasks
- `claude-3-5-haiku-20241022` — Faster, cheaper alternative

---

### OpenAI Codex

**Models:** GPT-5.3 Codex, GPT-5.2 Codex

> Requires ChatGPT Plus or Pro subscription

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Ensure you have ChatGPT Plus/Pro active
3. Generate an API key with Codex access

```bash
export OPENAI_CODEX_API_KEY="sk-..."
```

---

### xAI (Grok)

**Models:** Grok 4, Grok 3

1. Go to [console.x.ai](https://console.x.ai/)
2. Sign up with your X account
3. Navigate to **API Keys**
4. Generate a new key

```bash
export XAI_API_KEY="xai-..."
```

---

### Groq

**Models:** Llama 3.3 70B (ultra-fast inference)

1. Go to [console.groq.com](https://console.groq.com/)
2. Create an account
3. Navigate to **API Keys**
4. Create a new key

```bash
export GROQ_API_KEY="gsk_..."
```

**Why Groq?** Fastest inference speed available — great for rapid iteration.

---

### Mistral

**Models:** Mistral Large, Codestral

1. Go to [console.mistral.ai](https://console.mistral.ai/)
2. Create an account
3. Navigate to **API Keys**
4. Generate a new key

```bash
export MISTRAL_API_KEY="..."
```

**Recommended:** `codestral-latest` for coding tasks.

---

### Other Cloud Providers

| Provider | Sign Up | Env Var |
|----------|---------|---------|
| Cerebras | [cerebras.ai](https://cerebras.ai/) | `CEREBRAS_API_KEY` |
| MiniMax | [minimax.io](https://www.minimax.io/) | `MINIMAX_API_KEY` |
| Z.ai | [z.ai](https://z.ai/) | `ZAI_API_KEY` |
| Kimi | [moonshot.cn](https://www.moonshot.cn/) | `KIMI_API_KEY` |
| HuggingFace | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | `HUGGINGFACE_API_KEY` |
| OpenCode | [opencode.ai](https://opencode.ai/) | `OPENCODE_API_KEY` |

---

## Aggregators & Gateways

### OpenRouter

**Access 200+ models** including free tiers through a single API.

1. Go to [openrouter.ai](https://openrouter.ai/)
2. Sign up with GitHub, Google, or email
3. Navigate to **Keys** in the dashboard
4. Create a new key

```bash
export OPENROUTER_API_KEY="sk-or-..."
```

**Free models available:**
- `mistralai/devstral-small:free`
- `qwen/qwen-2.5-coder-32b-instruct:free`
- `deepseek/deepseek-chat:free`

See [Free Tier Models](#free-tier-models) for details.

---

## Enterprise Providers

### Amazon Bedrock

Requires AWS credentials and a custom base URL.

1. Set up AWS CLI with appropriate IAM permissions
2. Enable Bedrock access in your AWS region
3. Configure in Khadim settings with custom base URL

```bash
# Uses AWS credentials from environment or ~/.aws/credentials
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"
```

**Custom Base URL:** `https://bedrock-runtime.{region}.amazonaws.com`

---

### Azure OpenAI

1. Create an Azure OpenAI resource in the Azure Portal
2. Deploy a model (e.g., GPT-4o)
3. Get your endpoint and key from the resource

```bash
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
```

**Custom Base URL format:** `https://{your-resource-name}.openai.azure.com/openai/deployments/{deployment-name}`

---

### GitHub Copilot

Uses GitHub Copilot authentication. Requires an active Copilot subscription.

Configure through Khadim's settings using Copilot authentication flow.

---

## Local Models with Ollama

Run models entirely on your machine — no API key needed, complete privacy.

### Setup

1. Install Ollama:
   ```bash
   # macOS/Linux
   curl -fsSL https://ollama.ai/install.sh | sh

   # Windows
   # Download from https://ollama.ai/download
   ```

2. Pull a model:
   ```bash
   # Recommended for coding
   ollama pull llama3.1:8b
   ollama pull codellama:13b
   ollama pull deepseek-coder:6.7b

   # Larger models (if you have the VRAM)
   ollama pull llama3.1:70b
   ollama pull qwen2.5-coder:32b
   ```

3. Start Ollama (runs on `localhost:11434` by default):
   ```bash
   ollama serve
   ```

4. Select an Ollama model in Khadim's settings

### Recommended Local Models

| Model | Size | VRAM Needed | Best For |
|-------|------|-------------|----------|
| `llama3.1:8b` | 4.7 GB | 8 GB | General tasks |
| `codellama:13b` | 7.4 GB | 16 GB | Code generation |
| `deepseek-coder:6.7b` | 3.8 GB | 8 GB | Code, fast |
| `qwen2.5-coder:32b` | 18 GB | 32 GB | Best local coding |

### Custom Ollama URL

If Ollama runs on a different machine:

```bash
# In Khadim settings, set custom base URL:
http://192.168.1.100:11434
```

---

## Free Tier Models

### OpenRouter Free Models

OpenRouter offers several high-quality models at no cost:

| Model | ID | Notes |
|-------|-----|-------|
| DevStral Free | `mistralai/devstral-small:free` | Good for coding |
| Qwen 3 32B Free | `qwen/qwen-2.5-coder-32b-instruct:free` | Excellent coder |
| DeepSeek Chat Free | `deepseek/deepseek-chat:free` | General purpose |

**Usage:**
1. Sign up at [openrouter.ai](https://openrouter.ai/)
2. Set `OPENROUTER_API_KEY`
3. Select a `:free` model in settings

**Rate limits:** Free models have usage limits. Check OpenRouter dashboard for current limits.

### HuggingFace Inference API

Many open models are available for free with rate limits:

1. Get a free token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Set `HUGGINGFACE_API_KEY`
3. Access models like `meta-llama/Llama-3.2-3B-Instruct`

---

## Model Selection Guide

### By Use Case

| Task | Recommended | Why |
|------|-------------|-----|
| **Complex coding** | Claude Sonnet 4, GPT-5.3 Codex | Best reasoning |
| **Quick edits** | GPT-4o-mini, Claude Haiku | Fast, cheap |
| **Local/private** | Ollama + qwen2.5-coder | No data leaves machine |
| **Budget** | OpenRouter free models | Zero cost |
| **Speed** | Groq + Llama 3.3 70B | Fastest inference |

### By Budget

| Budget | Setup |
|--------|-------|
| **$0/month** | OpenRouter free + Ollama |
| **~$20/month** | Anthropic or OpenAI pay-as-you-go |
| **Enterprise** | Azure OpenAI or Bedrock (predictable pricing) |

### Cost vs Speed vs Quality

```
Quality:  Claude Sonnet 4 > GPT-4o > Codestral > Llama 3.3 70B > GPT-4o-mini
Speed:    Groq > GPT-4o-mini > Claude Haiku > GPT-4o > Claude Sonnet 4
Cost:     Free models < Ollama < GPT-4o-mini < GPT-4o < Claude Sonnet 4
```

**Rule of thumb:**
- Start with a free model to test your workflow
- Upgrade to paid when you need better accuracy
- Use fast/cheap models for simple operations, premium for complex ones

---

## Custom Base URLs

Khadim supports any OpenAI-compatible API. Configure custom endpoints for:

- Self-hosted models (vLLM, text-generation-inference)
- Enterprise proxies
- Regional endpoints
- Custom providers

### Configuration

In Khadim settings, set the custom base URL for your provider:

```
# Self-hosted vLLM
http://localhost:8000/v1

# LM Studio
http://localhost:1234/v1

# Azure OpenAI
https://your-resource.openai.azure.com/openai/deployments/your-deployment

# Together.ai
https://api.together.xyz/v1
```

### Testing Custom Endpoints

```bash
# Verify your endpoint works
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

## Troubleshooting

### "Invalid API key"

- Double-check the key is copied correctly (no extra spaces)
- Ensure the environment variable is set in the correct shell/process
- Some providers require account verification before API access

### "Model not found"

- Verify the exact model ID (check provider docs)
- Some models require specific access/waitlist approval
- Free tier models may have different IDs (e.g., `:free` suffix on OpenRouter)

### "Rate limited"

- Reduce request frequency
- Consider upgrading your plan
- Use multiple providers and rotate between them

### Ollama not connecting

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not, start it
ollama serve
```

### Azure/Bedrock authentication fails

- Verify credentials are set in environment
- Check IAM/RBAC permissions for the model
- Ensure the deployment/endpoint is active

---

## Environment Variables Reference

```bash
# Cloud Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_CODEX_API_KEY=sk-...
XAI_API_KEY=xai-...
GROQ_API_KEY=gsk_...
MISTRAL_API_KEY=...
CEREBRAS_API_KEY=...
MINIMAX_API_KEY=...
ZAI_API_KEY=...
KIMI_API_KEY=...
HUGGINGFACE_API_KEY=hf_...
OPENCODE_API_KEY=...

# Aggregators
OPENROUTER_API_KEY=sk-or-...

# Enterprise
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```
