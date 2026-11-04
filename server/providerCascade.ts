import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Schema } from "@google/genai";
import { createStableId } from "../src/shared/motionStudioContracts.ts";
import type {
  AIProviderId,
  ApiErrorPayload,
  ExecutionDiagnosticsSummary,
  ProviderAttemptDiagnostic,
  ProviderErrorType,
} from "../src/shared/motionStudioContracts.ts";

/**
 * Modelos reais e verificados nos catálogos oficiais:
 * 1. Google Gemini (@google/genai): "gemini-3.8-flash" (com fallback automático de modelo para "gemini-flash-latest" se 404/indisponível)
 * 2. OpenRouter (https://openrouter.ai/api/v1/models): "openrouter/free"
 * 3. NVIDIA NIM (https://integrate.api.nvidia.com/v1/models): "deepseek-ai/deepseek-v4.1-flash" (rápido e não trava em reasoning de 65k tokens, com fallback secundário "nvidia/nemotron-3-ultra-550b-a55b")
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const FALLBACK_GEMINI_LITE_MODEL = "gemini-3.1-flash-lite";
export const FALLBACK_GEMINI_MODEL = "gemini-flash-latest";
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
export const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
export const SECONDARY_NVIDIA_MODEL = "mistralai/mistral-large-2-instruct";

export const OPENROUTER_CHAT_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";
export const NVIDIA_CHAT_ENDPOINT =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 180_000;

export function hasConfiguredApiKey(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith("MY_") ||
    trimmed === "YOUR_API_KEY" ||
    trimmed === "PLACEHOLDER"
  ) {
    return false;
  }
  return true;
}

export function refreshEnvFromDotenvFile(): void {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
    for (const [key, val] of Object.entries(parsed)) {
      if (hasConfiguredApiKey(val)) {
        process.env[key] = val.trim();
      }
    }
  } catch {
    // Mantém process.env atual caso .env não esteja acessível
  }
}

function parseTimeoutEnv(envValue: string | undefined, fallbackMs: number): number {
  if (!envValue) return fallbackMs;
  const parsed = Number.parseInt(envValue.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < MIN_TIMEOUT_MS) return fallbackMs;
  return Math.min(MAX_TIMEOUT_MS, parsed);
}

export interface ProviderRuntimeConfig {
  provider: AIProviderId;
  label: string;
  model: string;
  timeoutMs: number;
  inactivityTimeoutMs: number;
  configured: boolean;
}

export function getProviderConfigs(
  mode: "html" | "json" = "html"
): Record<AIProviderId, ProviderRuntimeConfig> {
  refreshEnvFromDotenvFile();

  const geminiDefault = mode === "html" ? 75_000 : 55_000;
  const openrouterDefault = mode === "html" ? 60_000 : 45_000;
  const nvidiaDefault = mode === "html" ? 60_000 : 45_000;

  const geminiTimeoutMs = parseTimeoutEnv(
    process.env.GEMINI_TIMEOUT_MS,
    geminiDefault
  );
  const openrouterTimeoutMs = parseTimeoutEnv(
    process.env.OPENROUTER_TIMEOUT_MS,
    openrouterDefault
  );
  const nvidiaTimeoutMs = parseTimeoutEnv(
    process.env.NVIDIA_TIMEOUT_MS,
    nvidiaDefault
  );

  const geminiConfigured =
    hasConfiguredApiKey(process.env.GEMINI_API_KEY2) ||
    hasConfiguredApiKey(process.env.GEMINI_API_KEY);
  const openrouterConfigured = hasConfiguredApiKey(
    process.env.OPENROUTER_API_KEY
  );
  const nvidiaConfigured = hasConfiguredApiKey(process.env.NVIDIA_API_KEY);

  return {
    gemini: {
      provider: "gemini",
      label: "Google Gemini",
      model: (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim(),
      timeoutMs: geminiTimeoutMs,
      inactivityTimeoutMs: Math.min(geminiTimeoutMs, 35_000),
      configured: geminiConfigured,
    },
    openrouter: {
      provider: "openrouter",
      label: "OpenRouter",
      model: (process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL).trim(),
      timeoutMs: openrouterTimeoutMs,
      inactivityTimeoutMs: Math.min(openrouterTimeoutMs, 28_000),
      configured: openrouterConfigured,
    },
    nvidia: {
      provider: "nvidia",
      label: "NVIDIA NIM",
      model: (process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL).trim(),
      timeoutMs: nvidiaTimeoutMs,
      inactivityTimeoutMs: Math.min(nvidiaTimeoutMs, 28_000),
      configured: nvidiaConfigured,
    },
  };
}

/**
 * Remove qualquer token, chave de API ou credencial de mensagens de erro/logs.
 */
export function sanitizeDiagnosticText(raw: string): string {
  if (!raw) return "";
  let sanitized = raw;

  const secretCandidates = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY2,
    process.env.OPENROUTER_API_KEY,
    process.env.NVIDIA_API_KEY,
  ];
  for (const secret of secretCandidates) {
    if (secret && secret.trim().length >= 8) {
      sanitized = sanitized.split(secret.trim()).join("[REDACTED]");
    }
  }

  sanitized = sanitized
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, "Bearer [REDACTED]")
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[REDACTED_GEMINI_KEY]")
    .replace(/sk-or-v1-[0-9A-Za-z\-_]{16,}/g, "[REDACTED_OR_KEY]")
    .replace(/nvapi-[0-9A-Za-z\-_]{16,}/g, "[REDACTED_NV_KEY]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]");

  return sanitized.slice(0, 320).trim();
}

export function getUserFriendlyMessageForErrorType(
  errorType: ProviderErrorType
): string {
  switch (errorType) {
    case "timeout":
      return "O provedor de IA demorou mais que o esperado para responder.";
    case "auth_error":
      return "Falha na autenticação do provedor. Verifique a configuração da API.";
    case "rate_limit":
      return "O provedor atingiu seu limite de utilização.";
    case "provider_unavailable":
      return "O provedor está temporariamente indisponível.";
    case "invalid_response":
      return "O provedor retornou uma resposta incompleta ou fora do formato esperado.";
    case "network_error":
      return "Falha de conexão de rede ao comunicar com o provedor de IA.";
    case "http_error":
      return "O provedor rejeitou a requisição (erro de parâmetros ou modelo indisponível).";
    case "not_configured":
      return "Chave de API não configurada para este provedor.";
    case "cancelled":
      return "A geração foi cancelada pelo usuário.";
  }
}

export class ProviderCallError extends Error {
  readonly errorType: ProviderErrorType;
  readonly httpStatus: number | null;

  constructor(
    message: string,
    errorType: ProviderErrorType,
    httpStatus: number | null = null
  ) {
    super(sanitizeDiagnosticText(message));
    this.name = "ProviderCallError";
    this.errorType = errorType;
    this.httpStatus = httpStatus;
  }
}

export class CascadeExecutionError extends Error {
  readonly generationId: string;
  readonly operation: string;
  readonly primaryErrorType: ProviderErrorType | "all_providers_failed";
  readonly attempts: ProviderAttemptDiagnostic[];
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor(params: {
    message: string;
    generationId: string;
    operation: string;
    primaryErrorType: ProviderErrorType | "all_providers_failed";
    attempts: ProviderAttemptDiagnostic[];
    retryable: boolean;
    statusCode: number;
  }) {
    super(params.message);
    this.name = "CascadeExecutionError";
    this.generationId = params.generationId;
    this.operation = params.operation;
    this.primaryErrorType = params.primaryErrorType;
    this.attempts = params.attempts;
    this.retryable = params.retryable;
    this.statusCode = params.statusCode;
  }

  toApiErrorPayload(): ApiErrorPayload {
    return {
      error: this.message,
      errorType: this.primaryErrorType,
      generationId: this.generationId,
      retryable: this.retryable,
      failedProviders: this.attempts,
    };
  }
}

/**
 * Classifica qualquer erro lançado por SDK ou fetch em categoria precisa + HTTP status.
 */
export function classifyProviderError(
  err: unknown,
  abortReason?: "timeout" | "cancelled" | null
): {
  errorType: ProviderErrorType;
  httpStatus: number | null;
  reason: string;
} {
  if (abortReason === "cancelled") {
    return {
      errorType: "cancelled",
      httpStatus: 499,
      reason: "Requisição abortada por cancelamento do cliente.",
    };
  }

  if (abortReason === "timeout") {
    return {
      errorType: "timeout",
      httpStatus: 504,
      reason: "Tempo limite do provedor excedido durante a geração.",
    };
  }

  if (err instanceof ProviderCallError) {
    return {
      errorType: err.errorType,
      httpStatus: err.httpStatus,
      reason: err.message,
    };
  }

  const rawMsg =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === "string"
        ? err
        : JSON.stringify(err ?? "Erro desconhecido");
  const cleanMsg = sanitizeDiagnosticText(rawMsg);
  const lower = cleanMsg.toLowerCase();

  // Extrai status HTTP se presente no objeto ou na mensagem
  let httpStatus: number | null = null;
  if (err && typeof err === "object") {
    const maybeStatus =
      (err as { status?: unknown }).status ??
      (err as { statusCode?: unknown }).statusCode ??
      (err as { httpStatus?: unknown }).httpStatus;
    if (typeof maybeStatus === "number" && maybeStatus >= 100 && maybeStatus <= 599) {
      httpStatus = maybeStatus;
    }
  }
  if (httpStatus === null) {
    const statusMatch = cleanMsg.match(/\b(?:HTTP|status|code)\s*[:=]?\s*(4\d\d|5\d\d)\b/i);
    if (statusMatch && statusMatch[1]) {
      httpStatus = Number.parseInt(statusMatch[1], 10);
    }
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborted due to timeout") ||
    lower.includes("aborterror") ||
    lower.includes("operation was aborted") ||
    httpStatus === 408 ||
    httpStatus === 504
  ) {
    return {
      errorType: "timeout",
      httpStatus: httpStatus ?? 504,
      reason: cleanMsg,
    };
  }

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication") ||
    lower.includes("permission_denied")
  ) {
    return {
      errorType: "auth_error",
      httpStatus: httpStatus ?? 401,
      reason: cleanMsg,
    };
  }

  if (
    httpStatus === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota")
  ) {
    return {
      errorType: "rate_limit",
      httpStatus: httpStatus ?? 429,
      reason: cleanMsg,
    };
  }

  if (
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    lower.includes("unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("bad gateway") ||
    lower.includes("internal error")
  ) {
    return {
      errorType: "provider_unavailable",
      httpStatus: httpStatus ?? 503,
      reason: cleanMsg,
    };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("socket hang up") ||
    lower.includes("networkerror")
  ) {
    return {
      errorType: "network_error",
      httpStatus: null,
      reason: cleanMsg,
    };
  }

  if (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) {
    return {
      errorType: "http_error",
      httpStatus,
      reason: cleanMsg,
    };
  }

  return {
    errorType: "provider_unavailable",
    httpStatus,
    reason: cleanMsg,
  };
}

/**
 * Executa uma chamada assíncrona com AbortController 100% independente por tentativa,
 * watchdog de inatividade de stream, e propagação limpa de cancelamento do cliente.
 */
async function runWithAttemptTimeout<T>(options: {
  totalTimeoutMs: number;
  inactivityTimeoutMs: number;
  clientSignal?: AbortSignal;
  executor: (
    signal: AbortSignal,
    notifyActivity: () => void
  ) => Promise<T>;
}): Promise<T> {
  const { totalTimeoutMs, inactivityTimeoutMs, clientSignal, executor } = options;

  if (clientSignal?.aborted) {
    throw new ProviderCallError(
      "Requisição cancelada pelo cliente antes de iniciar a tentativa.",
      "cancelled",
      499
    );
  }

  const attemptController = new AbortController();
  let abortReason: "timeout" | "cancelled" | null = null;

  const totalTimer = setTimeout(() => {
    if (!attemptController.signal.aborted) {
      abortReason = "timeout";
      attemptController.abort(new Error("PROVIDER_TOTAL_TIMEOUT"));
    }
  }, totalTimeoutMs);

  let inactivityTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (!attemptController.signal.aborted) {
      abortReason = "timeout";
      attemptController.abort(new Error("PROVIDER_INACTIVITY_TIMEOUT"));
    }
  }, inactivityTimeoutMs);

  const notifyActivity = () => {
    if (attemptController.signal.aborted) return;
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    inactivityTimer = setTimeout(() => {
      if (!attemptController.signal.aborted) {
        abortReason = "timeout";
        attemptController.abort(new Error("PROVIDER_STREAM_STALL_TIMEOUT"));
      }
    }, inactivityTimeoutMs);
  };

  const onClientAbort = () => {
    if (!attemptController.signal.aborted) {
      abortReason = "cancelled";
      attemptController.abort(new Error("CLIENT_CANCELLED"));
    }
  };

  clientSignal?.addEventListener("abort", onClientAbort, { once: true });

  try {
    return await executor(attemptController.signal, notifyActivity);
  } catch (err) {
    if (abortReason === "cancelled" || clientSignal?.aborted) {
      throw new ProviderCallError(
        "Operação cancelada pelo usuário.",
        "cancelled",
        499
      );
    }
    if (abortReason === "timeout") {
      throw new ProviderCallError(
        `Tempo limite excedido (${totalTimeoutMs}ms máx / ${inactivityTimeoutMs}ms inatividade).`,
        "timeout",
        504
      );
    }
    throw err;
  } finally {
    clearTimeout(totalTimer);
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    clientSignal?.removeEventListener("abort", onClientAbort);
  }
}

function logStructuredAttempt(
  generationId: string,
  operation: string,
  attemptNumber: number,
  diag: ProviderAttemptDiagnostic
): void {
  const payload = {
    event: "mala_sombre_ai_attempt",
    generationId,
    operation,
    attemptNumber,
    provider: diag.provider,
    model: diag.model,
    startedAt: diag.startedAt,
    endedAt: diag.endedAt,
    durationMs: diag.durationMs,
    httpStatus: diag.httpStatus,
    outcome: diag.outcome,
    errorType: diag.errorType ?? null,
    failureReason: diag.failureReason ?? null,
  };
  if (diag.outcome === "success") {
    console.info("[AI Diagnostics]", JSON.stringify(payload));
  } else if (diag.outcome === "failed") {
    console.warn("[AI Diagnostics]", JSON.stringify(payload));
  } else {
    console.info("[AI Diagnostics]", JSON.stringify(payload));
  }
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
      // Desativa o p-retry silencioso interno do SDK (que dormia até o abortSignal estourar em 429/503)
      retryOptions: {
        attempts: 1,
      },
    },
  });
}

function getConfiguredGeminiKeys(): string[] {
  const keys: string[] = [];
  if (hasConfiguredApiKey(process.env.GEMINI_API_KEY2)) {
    keys.push(process.env.GEMINI_API_KEY2.trim());
  }
  if (hasConfiguredApiKey(process.env.GEMINI_API_KEY)) {
    const primary = process.env.GEMINI_API_KEY.trim();
    if (!keys.includes(primary)) {
      keys.push(primary);
    }
  }
  return keys;
}

/**
 * Chamada Gemini via streaming (`generateContentStream`) para resposta progressiva rápida,
 * evitando timeouts silenciosos em animações complexas.
 */
async function callGeminiStreaming(options: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  userPrompt: string;
  mode: "html" | "json";
  geminiSchema?: Schema;
  maxOutputTokens: number;
  signal: AbortSignal;
  notifyActivity: () => void;
}): Promise<{ text: string; modelUsed: string }> {
  const {
    apiKey,
    model,
    systemInstruction,
    userPrompt,
    mode,
    geminiSchema,
    maxOutputTokens,
    signal,
    notifyActivity,
  } = options;

  const ai = createGeminiClient(apiKey);

  const runStreamForModel = async (targetModel: string): Promise<string> => {
    const isGemini3 = targetModel.startsWith("gemini-3");
    const stream = await ai.models.generateContentStream({
      model: targetModel,
      contents: userPrompt,
      config: {
        systemInstruction,
        maxOutputTokens,
        temperature: 0.4,
        ...(mode === "json" && geminiSchema
          ? {
              responseMimeType: "application/json",
              responseSchema: geminiSchema,
            }
          : {}),
        ...(isGemini3
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
        abortSignal: signal,
      },
    });

    notifyActivity();
    const chunks: string[] = [];
    for await (const chunk of stream) {
      if (signal.aborted) {
        throw new Error("AbortError: stream aborted");
      }
      notifyActivity();
      if (chunk.text) {
        chunks.push(chunk.text);
      }
    }
    return chunks.join("");
  };

  const fallbackModels = [
    FALLBACK_GEMINI_LITE_MODEL,
    FALLBACK_GEMINI_MODEL,
  ].filter((m) => m !== model);

  let lastErr: unknown = null;
  for (const candidateModel of [model, ...fallbackModels]) {
    try {
      const text = await runStreamForModel(candidateModel);
      return { text, modelUsed: candidateModel };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      const isModelLevelFailure =
        msg.includes("not found") ||
        msg.includes("404") ||
        msg.includes("not supported") ||
        msg.includes("503") ||
        msg.includes("unavailable") ||
        msg.includes("high demand") ||
        msg.includes("overloaded");

      if (!signal.aborted && isModelLevelFailure) {
        notifyActivity();
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("Falha nos modelos Gemini.");
}

/**
 * Lê um stream SSE OpenAI-compatible (OpenRouter / NVIDIA NIM) ou resposta JSON direta,
 * acumulando `delta.content` e sinalizando atividade a cada pacote recebido.
 */
async function callOpenAICompatibleStreaming(options: {
  endpoint: string;
  apiKey: string;
  model: string;
  providerLabel: string;
  systemInstruction: string;
  userPrompt: string;
  maxTokens: number;
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  signal: AbortSignal;
  notifyActivity: () => void;
}): Promise<{ text: string; httpStatus: number; resolvedModel: string }> {
  const {
    endpoint,
    apiKey,
    model,
    providerLabel,
    systemInstruction,
    userPrompt,
    maxTokens,
    extraHeaders,
    extraBody,
    signal,
    notifyActivity,
  } = options;

  const executeFetch = async (
    bodyExtras: Record<string, unknown> | undefined
  ): Promise<Response> => {
    const payload: Record<string, unknown> = {
      model,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt },
      ],
      ...(bodyExtras ?? {}),
    };

    return fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
        ...(extraHeaders ?? {}),
      },
      body: JSON.stringify(payload),
      signal,
    });
  };

  let response = await executeFetch(extraBody);

  // Caso um sub-provedor do OpenRouter/NVIDIA rejeite parâmetros opcionais (HTTP 400), refaz enxuto imediatamente
  if (!response.ok && response.status === 400 && extraBody && !signal.aborted) {
    notifyActivity();
    response = await executeFetch(undefined);
  }

  notifyActivity();

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    const classified = classifyProviderError(
      new Error(`${providerLabel} HTTP ${response.status}: ${errBody.slice(0, 260)}`)
    );
    throw new ProviderCallError(
      `${providerLabel} HTTP ${response.status}: ${errBody.slice(0, 220)}`,
      classified.errorType,
      response.status
    );
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  // Caso o endpoint responda JSON direto (não-SSE)
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
      error?: { message?: string; code?: number };
    };
    if (data.error?.message) {
      const code = typeof data.error.code === "number" ? data.error.code : 502;
      const classified = classifyProviderError(
        new Error(`${providerLabel} HTTP ${code}: ${data.error.message}`)
      );
      throw new ProviderCallError(
        `${providerLabel}: ${data.error.message}`,
        classified.errorType,
        code
      );
    }
    const content = data.choices?.[0]?.message?.content ?? "";
    return {
      text: content,
      httpStatus: response.status,
      resolvedModel: data.model || model,
    };
  }

  // Leitura progressiva de Server-Sent Events (SSE)
  if (!response.body) {
    throw new ProviderCallError(
      `${providerLabel} retornou corpo de stream vazio.`,
      "invalid_response",
      response.status
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let resolvedModel = model;
  const contentParts: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      notifyActivity();
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const rawLine = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        newlineIdx = buffer.indexOf("\n");

        if (!rawLine || !rawLine.startsWith("data:")) continue;
        const dataPayload = rawLine.slice(5).trim();
        if (dataPayload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(dataPayload) as {
            model?: string;
            error?: { message?: string; code?: number };
            choices?: Array<{
              delta?: { content?: string | null };
              message?: { content?: string | null };
            }>;
          };
          if (parsed.error?.message) {
            throw new ProviderCallError(
              `${providerLabel} stream error: ${parsed.error.message}`,
              "provider_unavailable",
              parsed.error.code ?? 502
            );
          }
          if (parsed.model) {
            resolvedModel = parsed.model;
          }
          const piece =
            parsed.choices?.[0]?.delta?.content ??
            parsed.choices?.[0]?.message?.content;
          if (typeof piece === "string" && piece.length > 0) {
            contentParts.push(piece);
          }
        } catch (parseErr) {
          if (parseErr instanceof ProviderCallError) {
            throw parseErr;
          }
          // Ignora linhas SSE parciais/comentários não-JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    text: contentParts.join(""),
    httpStatus: response.status,
    resolvedModel,
  };
}

/**
 * Injeção controlada de falhas APENAS para suíte de verificação automatizada local (testes 5 a 9).
 */
export interface ProviderSimulationFault {
  action?:
    | "timeout"
    | "auth_error"
    | "rate_limit"
    | "provider_unavailable"
    | "network_error"
    | "invalid_response"
    | "mock_valid_html";
  delayMs?: number;
  timeoutOverrideMs?: number;
}

export type CascadeSimulationMap = Partial<
  Record<AIProviderId, ProviderSimulationFault>
>;

export interface ExecuteCascadeOptions<T> {
  operation: string;
  mode: "html" | "json";
  systemInstruction: string;
  userPrompt: string;
  jsonFallbackReminder?: string;
  geminiSchema?: Schema;
  maxOutputTokens?: number;
  validateAndTransform: (rawText: string, provider: AIProviderId) => T;
  clientSignal?: AbortSignal;
  simulationFaults?: CascadeSimulationMap;
}

export interface ExecuteCascadeResult<T> {
  value: T;
  diagnostics: ExecutionDiagnosticsSummary;
  attempts: ProviderAttemptDiagnostic[];
}

async function applySimulationFaultIfPresent(
  provider: AIProviderId,
  fault: ProviderSimulationFault | undefined,
  signal: AbortSignal,
  notifyActivity: () => void
): Promise<string | null> {
  if (!fault || !fault.action) return null;

  if (fault.delayMs && fault.delayMs > 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), fault.delayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("AbortError: aborted during simulated delay"));
      };
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new Error("AbortError: already aborted"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  notifyActivity();

  switch (fault.action) {
    case "timeout":
      // Aguarda até que o AbortController independente da tentativa dispare o timeout real
      await new Promise<void>((_resolve, reject) => {
        const onAbort = () =>
          reject(new Error("AbortError: simulated provider hang timed out"));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      });
      return null;
    case "auth_error":
      throw new ProviderCallError(
        `HTTP 401 Unauthorized (${provider}): Invalid API credentials`,
        "auth_error",
        401
      );
    case "rate_limit":
      throw new ProviderCallError(
        `HTTP 429 Too Many Requests (${provider}): Rate limit exceeded`,
        "rate_limit",
        429
      );
    case "provider_unavailable":
      throw new ProviderCallError(
        `HTTP 503 Service Unavailable (${provider}): Upstream overloaded`,
        "provider_unavailable",
        503
      );
    case "network_error":
      throw new ProviderCallError(
        `TypeError: fetch failed (ECONNREFUSED ${provider})`,
        "network_error",
        null
      );
    case "invalid_response":
      return "<html><body>Resposta truncada sem script nem seek</body></html>";
    case "mock_valid_html":
      return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Mala.Sombre Fallback Verification</title></head>
<body style="margin:0;background:#050507;display:flex;align-items:center;justify-content:center;">
<canvas id="c" width="1920" height="1080" style="width:100vw;height:100vh;object-fit:contain;"></canvas>
<script>
window.DURATION = 6;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
window.seek = function(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0B0F19';
  ctx.fillRect(0, 0, 1920, 1080);
  const p = Math.min(1, Math.max(0, t / window.DURATION));
  ctx.fillStyle = '#8A2BE2';
  ctx.fillRect(240, 520, 1440 * p, 40);
};
window.seek(0);
</script>
</body>
</html>`;
  }
}

/**
 * Motor unificado de Cascata de Provedores:
 * Ordem estrita: 1. Gemini -> 2. OpenRouter -> 3. NVIDIA NIM
 * - AbortController e temporizadores independentes por tentativa (limpos em finally)
 * - Preservação integral dos erros de cada provedor
 * - Respeito imediato ao cancelamento do cliente (não dispara fallbacks após cancelamento)
 */
export async function executeProviderCascade<T>(
  options: ExecuteCascadeOptions<T>
): Promise<ExecuteCascadeResult<T>> {
  const {
    operation,
    mode,
    systemInstruction,
    userPrompt,
    jsonFallbackReminder,
    geminiSchema,
    maxOutputTokens = mode === "html" ? 16384 : 8192,
    validateAndTransform,
    clientSignal,
    simulationFaults,
  } = options;

  const generationId = createStableId("gen");
  const configs = getProviderConfigs(mode);
  const attempts: ProviderAttemptDiagnostic[] = [];
  const providerOrder: AIProviderId[] = ["gemini", "openrouter", "nvidia"];

  for (let idx = 0; idx < providerOrder.length; idx++) {
    const providerId = providerOrder[idx];
    const cfg = configs[providerId];
    const fault = simulationFaults?.[providerId];

    // Se o cliente já cancelou, interrompe imediatamente sem tentar próximos provedores
    if (clientSignal?.aborted) {
      const nowIso = new Date().toISOString();
      const cancelDiag: ProviderAttemptDiagnostic = {
        provider: providerId,
        providerLabel: cfg.label,
        model: cfg.model,
        startedAt: nowIso,
        endedAt: nowIso,
        durationMs: 0,
        httpStatus: 499,
        outcome: "failed",
        errorType: "cancelled",
        failureReason: "Cancelado pelo usuário.",
        userMessage: getUserFriendlyMessageForErrorType("cancelled"),
      };
      attempts.push(cancelDiag);
      throw new CascadeExecutionError({
        message: getUserFriendlyMessageForErrorType("cancelled"),
        generationId,
        operation,
        primaryErrorType: "cancelled",
        attempts,
        retryable: true,
        statusCode: 499,
      });
    }

    // Verifica disponibilidade de credencial (a menos que em modo de simulação explícita de teste)
    if (!cfg.configured && !fault) {
      const nowIso = new Date().toISOString();
      const skippedDiag: ProviderAttemptDiagnostic = {
        provider: providerId,
        providerLabel: cfg.label,
        model: cfg.model,
        startedAt: nowIso,
        endedAt: nowIso,
        durationMs: 0,
        httpStatus: null,
        outcome: "skipped",
        errorType: "not_configured",
        failureReason: "Chave de API ausente no ambiente para este provedor.",
        userMessage: getUserFriendlyMessageForErrorType("not_configured"),
      };
      attempts.push(skippedDiag);
      logStructuredAttempt(generationId, operation, idx + 1, skippedDiag);
      continue;
    }

    const attemptStartMs = Date.now();
    const startedAtIso = new Date(attemptStartMs).toISOString();
    const effectiveTimeoutMs = fault?.timeoutOverrideMs ?? cfg.timeoutMs;
    const effectiveInactivityMs = fault?.timeoutOverrideMs
      ? fault.timeoutOverrideMs
      : cfg.inactivityTimeoutMs;

    let resolvedModelName = cfg.model;

    try {
      const rawOutput = await runWithAttemptTimeout<string>({
        totalTimeoutMs: effectiveTimeoutMs,
        inactivityTimeoutMs: effectiveInactivityMs,
        clientSignal,
        executor: async (signal, notifyActivity) => {
          const simulated = await applySimulationFaultIfPresent(
            providerId,
            fault,
            signal,
            notifyActivity
          );
          if (simulated !== null) {
            return simulated;
          }

          if (providerId === "gemini") {
            const geminiKeys = getConfiguredGeminiKeys();
            let lastKeyErr: unknown = null;
            for (let kIdx = 0; kIdx < geminiKeys.length; kIdx++) {
              try {
                const res = await callGeminiStreaming({
                  apiKey: geminiKeys[kIdx],
                  model: cfg.model,
                  systemInstruction,
                  userPrompt,
                  mode,
                  geminiSchema,
                  maxOutputTokens,
                  signal,
                  notifyActivity,
                });
                resolvedModelName = res.modelUsed;
                return res.text;
              } catch (keyErr) {
                lastKeyErr = keyErr;
                const check = classifyProviderError(keyErr);
                // Se existe uma segunda chave Gemini (ex: GEMINI_API_KEY após GEMINI_API_KEY2 falhar com 401/403/429), tenta imediatamente
                // Só troca de chave se o erro for de credencial (401/403) ou cota da chave (429)
                const canTrySecondaryKey =
                  kIdx + 1 < geminiKeys.length &&
                  !signal.aborted &&
                  (check.errorType === "auth_error" ||
                    check.errorType === "rate_limit");
                if (!canTrySecondaryKey) {
                  throw keyErr;
                }
                notifyActivity();
              }
            }
            throw lastKeyErr ?? new Error("Chave Gemini indisponível.");
          }

          if (providerId === "openrouter") {
            const promptToSend =
              mode === "json" && jsonFallbackReminder
                ? `${userPrompt}\n\n${jsonFallbackReminder}`
                : userPrompt;
            const res = await callOpenAICompatibleStreaming({
              endpoint: OPENROUTER_CHAT_ENDPOINT,
              apiKey: process.env.OPENROUTER_API_KEY || "",
              model: cfg.model,
              providerLabel: cfg.label,
              systemInstruction,
              userPrompt: promptToSend,
              maxTokens: maxOutputTokens,
              extraHeaders: {
                "HTTP-Referer":
                  process.env.APP_URL || "http://localhost:3000",
                "X-Title": "Mala.Sombre Motion Studio",
              },
              extraBody: {
                reasoning: { enabled: false },
              },
              signal,
              notifyActivity,
            });
            resolvedModelName = res.resolvedModel;
            return res.text;
          }

          // Provider 3: NVIDIA NIM
          const promptToSend =
            mode === "json" && jsonFallbackReminder
              ? `${userPrompt}\n\n${jsonFallbackReminder}`
              : userPrompt;
          try {
            const isNemotron = cfg.model.includes("nemotron");
            const res = await callOpenAICompatibleStreaming({
              endpoint: NVIDIA_CHAT_ENDPOINT,
              apiKey: process.env.NVIDIA_API_KEY || "",
              model: cfg.model,
              providerLabel: cfg.label,
              systemInstruction,
              userPrompt: promptToSend,
              maxTokens: maxOutputTokens,
              extraBody: isNemotron
                ? { chat_template_kwargs: { enable_thinking: false } }
                : undefined,
              signal,
              notifyActivity,
            });
            resolvedModelName = res.resolvedModel;
            return res.text;
          } catch (nvPrimaryErr) {
            const check = classifyProviderError(nvPrimaryErr);
            if (
              !signal.aborted &&
              cfg.model !== SECONDARY_NVIDIA_MODEL &&
              (check.errorType === "http_error" ||
                check.errorType === "provider_unavailable" ||
                check.errorType === "timeout")
            ) {
              notifyActivity();
              const res2 = await callOpenAICompatibleStreaming({
                endpoint: NVIDIA_CHAT_ENDPOINT,
                apiKey: process.env.NVIDIA_API_KEY || "",
                model: SECONDARY_NVIDIA_MODEL,
                providerLabel: cfg.label,
                systemInstruction,
                userPrompt: promptToSend,
                maxTokens: maxOutputTokens,
                signal,
                notifyActivity,
              });
              resolvedModelName = res2.resolvedModel;
              return res2.text;
            }
            throw nvPrimaryErr;
          }
        },
      });

      // Valida o conteúdo ANTES de declarar sucesso (nunca retorna resposta inválida!)
      let transformed: T;
      try {
        if (!rawOutput || !rawOutput.trim()) {
          throw new ProviderCallError(
            `${cfg.label} retornou conteúdo vazio.`,
            "invalid_response",
            200
          );
        }
        transformed = validateAndTransform(rawOutput, providerId);
      } catch (validationErr) {
        const reason =
          validationErr instanceof Error
            ? validationErr.message
            : "Resposta fora do contrato esperado.";
        throw new ProviderCallError(reason, "invalid_response", 200);
      }

      const endedAtMs = Date.now();
      const successDiag: ProviderAttemptDiagnostic = {
        provider: providerId,
        providerLabel: cfg.label,
        model: resolvedModelName,
        startedAt: startedAtIso,
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: endedAtMs - attemptStartMs,
        httpStatus: 200,
        outcome: "success",
      };
      attempts.push(successDiag);
      logStructuredAttempt(generationId, operation, idx + 1, successDiag);

      return {
        value: transformed,
        diagnostics: {
          generationId,
          providerUsed: providerId,
          providerLabel: cfg.label,
          modelUsed: resolvedModelName,
          durationMs: successDiag.durationMs,
          attemptsCount: attempts.filter((a) => a.outcome !== "skipped").length,
        },
        attempts,
      };
    } catch (attemptErr) {
      const endedAtMs = Date.now();
      const classified = classifyProviderError(attemptErr);

      const failedDiag: ProviderAttemptDiagnostic = {
        provider: providerId,
        providerLabel: cfg.label,
        model: resolvedModelName,
        startedAt: startedAtIso,
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: endedAtMs - attemptStartMs,
        httpStatus: classified.httpStatus,
        outcome: "failed",
        errorType: classified.errorType,
        failureReason: classified.reason,
        userMessage: getUserFriendlyMessageForErrorType(classified.errorType),
      };
      attempts.push(failedDiag);
      logStructuredAttempt(generationId, operation, idx + 1, failedDiag);

      // Se o cancelamento partiu do usuário, não avança para o próximo provedor da cascata
      if (classified.errorType === "cancelled" || clientSignal?.aborted) {
        throw new CascadeExecutionError({
          message: getUserFriendlyMessageForErrorType("cancelled"),
          generationId,
          operation,
          primaryErrorType: "cancelled",
          attempts,
          retryable: true,
          statusCode: 499,
        });
      }
      // Caso contrário, continua automaticamente para o próximo provedor da cascata!
    }
  }

  // Todos os provedores foram tentados (ou pulados por falta de chave) e nenhum teve sucesso
  const executedFailures = attempts.filter((a) => a.outcome === "failed");

  if (executedFailures.length === 0) {
    throw new CascadeExecutionError({
      message:
        "Falha na autenticação do provedor. Verifique a configuração da API (nenhuma chave de API ativa foi encontrada no servidor).",
      generationId,
      operation,
      primaryErrorType: "auth_error",
      attempts,
      retryable: false,
      statusCode: 401,
    });
  }

  const uniqueErrorTypes = new Set(
    executedFailures.map((f) => f.errorType).filter(Boolean)
  );

  // Determina mensagem principal clara e específica em português
  let headlineMessage =
    "Não foi possível gerar a animação. Todos os provedores disponíveis falharam.";
  let primaryErrorType: ProviderErrorType | "all_providers_failed" =
    "all_providers_failed";
  let statusCode = 503;
  let retryable = true;

  if (uniqueErrorTypes.size === 1) {
    const onlyType = executedFailures[0].errorType!;
    primaryErrorType = onlyType;
    const baseMsg = getUserFriendlyMessageForErrorType(onlyType);
    headlineMessage =
      executedFailures.length > 1
        ? `${baseMsg} Não foi possível gerar a animação pois todos os provedores disponíveis falharam.`
        : baseMsg;

    if (onlyType === "timeout") statusCode = 504;
    else if (onlyType === "auth_error") {
      statusCode = 401;
      retryable = false;
    } else if (onlyType === "rate_limit") statusCode = 429;
    else if (onlyType === "invalid_response") statusCode = 502;
  } else if (executedFailures.every((f) => f.errorType === "timeout")) {
    primaryErrorType = "timeout";
    statusCode = 504;
    headlineMessage =
      "O provedor de IA demorou mais que o esperado para responder. Todos os provedores disponíveis atingiram o tempo limite.";
  }

  throw new CascadeExecutionError({
    message: headlineMessage,
    generationId,
    operation,
    primaryErrorType,
    attempts,
    retryable,
    statusCode,
  });
}

export interface ProviderHealthReport {
  provider: AIProviderId;
  label: string;
  model: string;
  configured: boolean;
  timeoutMs: number;
  probed: boolean;
  reachable?: boolean;
  authenticated?: boolean;
  httpStatus?: number | null;
  latencyMs?: number;
  errorType?: ProviderErrorType;
  message?: string;
}

/**
 * Inspeciona disponibilidade e opcionalmente testa conexão/autenticação real de cada provedor,
 * sem jamais expor chaves ou segredos.
 */
export async function diagnoseProvidersHealth(
  probeLive: boolean
): Promise<ProviderHealthReport[]> {
  const configs = getProviderConfigs("json");
  const order: AIProviderId[] = ["gemini", "openrouter", "nvidia"];
  const reports: ProviderHealthReport[] = [];

  for (const id of order) {
    const cfg = configs[id];
    if (!probeLive || !cfg.configured) {
      reports.push({
        provider: id,
        label: cfg.label,
        model: cfg.model,
        configured: cfg.configured,
        timeoutMs: cfg.timeoutMs,
        probed: false,
        message: cfg.configured
          ? "Chave configurada no servidor."
          : "Chave de API não configurada no ambiente.",
      });
      continue;
    }

    const start = Date.now();
    let effectiveModel = cfg.model;
    try {
      await runWithAttemptTimeout({
        totalTimeoutMs: 18_000,
        inactivityTimeoutMs: 15_000,
        executor: async (signal, notifyActivity) => {
          if (id === "gemini") {
            const keys = getConfiguredGeminiKeys();
            let lastErr: unknown = null;
            for (let kIdx = 0; kIdx < keys.length; kIdx++) {
              try {
                const res = await callGeminiStreaming({
                  apiKey: keys[kIdx],
                  model: cfg.model,
                  systemInstruction: "Responda apenas OK.",
                  userPrompt: "Ping",
                  mode: "html",
                  maxOutputTokens: 16,
                  signal,
                  notifyActivity,
                });
                effectiveModel = res.modelUsed;
                return;
              } catch (err) {
                lastErr = err;
                const check = classifyProviderError(err);
                if (
                  kIdx + 1 < keys.length &&
                  !signal.aborted &&
                  (check.errorType === "auth_error" ||
                    check.errorType === "rate_limit")
                ) {
                  notifyActivity();
                  continue;
                }
                throw err;
              }
            }
            throw lastErr;
          }
          if (id === "openrouter") {
            const res = await callOpenAICompatibleStreaming({
              endpoint: OPENROUTER_CHAT_ENDPOINT,
              apiKey: process.env.OPENROUTER_API_KEY || "",
              model: cfg.model,
              providerLabel: cfg.label,
              systemInstruction: "Reply with OK.",
              userPrompt: "Ping",
              maxTokens: 16,
              extraHeaders: {
                "HTTP-Referer":
                  process.env.APP_URL || "http://localhost:3000",
                "X-Title": "Mala.Sombre Motion Studio",
              },
              extraBody: {
                reasoning: { enabled: false },
              },
              signal,
              notifyActivity,
            });
            effectiveModel = res.resolvedModel;
            return;
          }
          try {
            const isNemotron = cfg.model.includes("nemotron");
            const res = await callOpenAICompatibleStreaming({
              endpoint: NVIDIA_CHAT_ENDPOINT,
              apiKey: process.env.NVIDIA_API_KEY || "",
              model: cfg.model,
              providerLabel: cfg.label,
              systemInstruction: "Reply with OK.",
              userPrompt: "Ping",
              maxTokens: 16,
              extraBody: isNemotron
                ? { chat_template_kwargs: { enable_thinking: false } }
                : undefined,
              signal,
              notifyActivity,
            });
            effectiveModel = res.resolvedModel;
          } catch (nvErr) {
            if (!signal.aborted && cfg.model !== SECONDARY_NVIDIA_MODEL) {
              notifyActivity();
              const res2 = await callOpenAICompatibleStreaming({
                endpoint: NVIDIA_CHAT_ENDPOINT,
                apiKey: process.env.NVIDIA_API_KEY || "",
                model: SECONDARY_NVIDIA_MODEL,
                providerLabel: cfg.label,
                systemInstruction: "Reply with OK.",
                userPrompt: "Ping",
                maxTokens: 16,
                signal,
                notifyActivity,
              });
              effectiveModel = res2.resolvedModel;
              return;
            }
            throw nvErr;
          }
        },
      });

      reports.push({
        provider: id,
        label: cfg.label,
        model: effectiveModel,
        configured: true,
        timeoutMs: cfg.timeoutMs,
        probed: true,
        reachable: true,
        authenticated: true,
        httpStatus: 200,
        latencyMs: Date.now() - start,
        message: "Conexão e autenticação verificadas com sucesso.",
      });
    } catch (err) {
      const classified = classifyProviderError(err);
      reports.push({
        provider: id,
        label: cfg.label,
        model: cfg.model,
        configured: true,
        timeoutMs: cfg.timeoutMs,
        probed: true,
        reachable: classified.errorType !== "network_error",
        authenticated: classified.errorType !== "auth_error",
        httpStatus: classified.httpStatus,
        latencyMs: Date.now() - start,
        errorType: classified.errorType,
        message: `${getUserFriendlyMessageForErrorType(classified.errorType)} (${classified.reason})`,
      });
    }
  }

  return reports;
}
