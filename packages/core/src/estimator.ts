// Pre-flight worst-case cost estimator. MIT/OSS (ARCHITECTURE §3). Pure + deterministic — no
// network. v0.1 uses a local char-heuristic for input tokens; the cached /count_tokens client is
// a later task. Worst case = charge full max_tokens as output, so we never under-reserve.

import { cost } from "./pricing.js";

// Anthropic content blocks can be strings or structured objects; we only need their text length.
export type MessageContent = string | ReadonlyArray<unknown>;

export interface Message {
  readonly role: string;
  readonly content: MessageContent;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly [key: string]: unknown;
}

// Subset of the Anthropic Messages API body relevant to estimation.
export interface MessagesRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly system?: string;
  readonly messages: ReadonlyArray<Message>;
  readonly tools?: ReadonlyArray<ToolDefinition>;
}

const CHARS_PER_TOKEN = 3.5;
const TOOL_OVERHEAD_TOKENS = 8;

function contentToChars(content: MessageContent): number {
  if (typeof content === "string") {
    return content.length;
  }
  // Structured blocks: serialize deterministically and measure. Conservative (counts JSON keys).
  return content.reduce<number>((sum, block) => sum + JSON.stringify(block).length, 0);
}

/**
 * Deterministic local heuristic for input tokens: ceil(totalChars / 3.5) over system + every
 * message, plus a fixed per-tool overhead. Pure — no network, safe for unit testing.
 */
export function estimateInputTokens(request: MessagesRequest): number {
  const systemChars = request.system ? request.system.length : 0;
  const messageChars = request.messages.reduce<number>(
    (sum, message) => sum + contentToChars(message.content),
    0
  );
  const toolChars = (request.tools ?? []).reduce<number>(
    (sum, tool) => sum + tool.name.length + (tool.description?.length ?? 0),
    0
  );
  const toolOverhead = (request.tools?.length ?? 0) * TOOL_OVERHEAD_TOKENS;

  const totalChars = systemChars + messageChars + toolChars;
  return Math.ceil(totalChars / CHARS_PER_TOKEN) + toolOverhead;
}

function assertValidRequest(request: MessagesRequest): void {
  if (!Array.isArray(request.messages)) {
    throw new Error("estimateWorstCase: request.messages must be an array");
  }
  const { max_tokens } = request;
  if (typeof max_tokens !== "number" || !Number.isInteger(max_tokens) || max_tokens <= 0) {
    throw new Error("estimateWorstCase: request.max_tokens must be a positive integer");
  }
}

/**
 * Worst-case pre-flight cost in USD: estimated input tokens charged as input, full max_tokens
 * charged as output (the model can produce at most max_tokens). Unknown model fails closed via
 * the pricing fallback. Throws on missing/invalid max_tokens or messages.
 */
export function estimateWorstCase(request: MessagesRequest): number {
  assertValidRequest(request);
  const inputTokens = estimateInputTokens(request);
  return cost(request.model, inputTokens, request.max_tokens);
}
