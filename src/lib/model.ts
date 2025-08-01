import { createOpenAI } from "@ai-sdk/openai";

// Claude CLI 本地API配置
const claudeCLI = createOpenAI({
  baseURL: process.env.CLAUDE_CLI_BASE_URL || "http://localhost:8000/v1",
  apiKey: process.env.CLAUDE_CLI_API_KEY || "dummy-key",
});

export const ANTHROPIC_MODEL = claudeCLI("claude-code");
