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
  StreamProgressEvent,
} from "../src/shared/motionStudioContracts.ts";

/**
 * Modelos configurados e verificados em execução real nos catálogos oficiais:
 * 1. Google Gemini (@google/genai):
 *    - Primário: "gemini-3.8-flash"
 *    - Fallbacks internos de modelo (em caso de HTTP 503 alta demanda ou 404): "gemini-3.1-flash-lite", "gemini-flash-latest"
 * 2. OpenRouter (https://openrouter.ai/api/v1/models):
 *    - Primário: "openrouter/free" (com reasoning desativado para evitar consumo silencioso do orçamento)
 * 3. NVIDIA NIM (https://integrate.api.nvidia.com/v1/models):
 *    - Primário: "nvidia/nemotron-3.5-lightning-30b-a3b" (com enable_thinking: false)
 *    - Fallback secundário: "mistralai/mistral-large-2-instruct"
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

/**
 * Orçamentos padrão coordenados para caber confortavelmente nos limites reais de proxy HTTP,
 * combinados com streaming SSE contínuo até o navegador:
 * - Gemini: 45s (inatividade máx 20s)
 * - OpenRouter: 38s (inatividade máx 18s)
 * - NVIDIA NIM: 38s (inatividade máx 18s)
 * - Teto global previsível da cascata inteira: 95s (CASCADE_TOTAL_BUDGET_MS)
 */
export const DEFAULT_GEMINI_TIMEOUT_MS = 45_000;
export const DEFAULT_OPENROUTER_TIMEOUT_MS = 38_000;
export const DEFAULT_NVIDIA_TIMEOUT_MS = 38_000;
export const DEFAULT_CASCADE_TOTAL_BUDGET_MS = 95_000;

const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 150_000;
const MIN_REMAINING_BUDGET_TO_START_MS = 1_200;
const PROGRESS_THROTTLE_MS = 750;

// Contadores internos para auditoria de limpeza de recursos (timers, listeners e tentativas ativas)
let activeAttemptCount = 0;
let activeTimerCount = 0;
let activeClientListenerCount = 0;

export interface ActiveCascadeTelemetry {
  activeAttempts: number;
  activeTimers: number;
  activeClientListeners: number;
}

export function getActiveCascadeTelemetry(): ActiveCascadeTelemetry {
  return {
    activeAttempts: activeAttemptCount,
    activeTimers: activeTimerCount,
    activeClientListeners: activeClientListenerCount,
  };
}

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

export function getCascadeTotalBudgetMs(): number {
  return parseTimeoutEnv(
    process.env.CASCADE_TOTAL_BUDGET_MS,
    DEFAULT_CASCADE_TOTAL_BUDGET_MS
  );
}

export interface ProviderRuntimeConfig {
  provider: AIProviderId;
  label: string;
  model: string;
  timeoutMs: number;
  inactivityTimeoutMs: number;
  configured: boolean;
}

/**
 * Detecta se um valor parece ser uma chave/token de API colado por engano em variável de nome de modelo.
 */
function isLikelySecretToken(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(AIza|AQ\.|sk-|nvapi-|gsk_|hf_|Bearer\s)/i.test(trimmed)) {
    return true;
  }
  if (
    trimmed.length >= 36 &&
    !trimmed.includes("/") &&
    !/^(?:models\/)?gemini-/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/**
 * Valida estritamente o identificador do modelo configurado via env, ignorando placeholders ou chaves coladas por engano.
 */
export function resolveValidModelId(
  envValue: string | undefined,
  defaultModel: string,
  provider: AIProviderId
): string {
  if (!envValue) return defaultModel;
  const trimmed = envValue.trim();
  if (
    !trimmed ||
    trimmed.startsWith("MY_") ||
    trimmed === "YOUR_API_KEY" ||
    trimmed === "PLACEHOLDER" ||
    isLikelySecretToken(trimmed) ||
    /\s/.test(trimmed)
  ) {
    return defaultModel;
  }

  if (provider === "gemini") {
    return /^(?:models\/)?gemini-[a-z0-9.-]+$/i.test(trimmed)
      ? trimmed
      : defaultModel;
  }

  // OpenRouter e NVIDIA NIM utilizam slugs no formato "vendor/model-name"
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(trimmed)
    ? trimmed
    : defaultModel;
}

function getEffectiveOpenRouterKey(): string {
  if (hasConfiguredApiKey(process.env.OPENROUTER_API_KEY)) {
    return process.env.OPENROUTER_API_KEY.trim();
  }
  if (
    process.env.OPENROUTER_MODEL &&
    /^sk-or-/i.test(process.env.OPENROUTER_MODEL.trim())
  ) {
    return process.env.OPENROUTER_MODEL.trim();
  }
  return "";
}

function getEffectiveNvidiaKey(): string {
  if (hasConfiguredApiKey(process.env.NVIDIA_API_KEY)) {
    return process.env.NVIDIA_API_KEY.trim();
  }
  if (
    process.env.NVIDIA_MODEL &&
    /^nvapi-/i.test(process.env.NVIDIA_MODEL.trim())
  ) {
    return process.env.NVIDIA_MODEL.trim();
  }
  return "";
}

export function getProviderConfigs(
  _mode: "html" | "json" = "html"
): Record<AIProviderId, ProviderRuntimeConfig> {
  refreshEnvFromDotenvFile();

  const geminiTimeoutMs = parseTimeoutEnv(
    process.env.GEMINI_TIMEOUT_MS,
    DEFAULT_GEMINI_TIMEOUT_MS
  );
  const openrouterTimeoutMs = parseTimeoutEnv(
    process.env.OPENROUTER_TIMEOUT_MS,
    DEFAULT_OPENROUTER_TIMEOUT_MS
  );
  const nvidiaTimeoutMs = parseTimeoutEnv(
    process.env.NVIDIA_TIMEOUT_MS,
    DEFAULT_NVIDIA_TIMEOUT_MS
  );

  const geminiConfigured =
    hasConfiguredApiKey(process.env.GEMINI_API_KEY2) ||
    hasConfiguredApiKey(process.env.GEMINI_API_KEY);
  const openrouterConfigured = Boolean(getEffectiveOpenRouterKey());
  const nvidiaConfigured = Boolean(getEffectiveNvidiaKey());

  return {
    gemini: {
      provider: "gemini",
      label: "Google Gemini",
      model: resolveValidModelId(
        process.env.GEMINI_MODEL,
        DEFAULT_GEMINI_MODEL,
        "gemini"
      ),
      timeoutMs: geminiTimeoutMs,
      inactivityTimeoutMs: Math.min(geminiTimeoutMs, 20_000),
      configured: geminiConfigured,
    },
    openrouter: {
      provider: "openrouter",
      label: "OpenRouter",
      model: resolveValidModelId(
        process.env.OPENROUTER_MODEL,
        DEFAULT_OPENROUTER_MODEL,
        "openrouter"
      ),
      timeoutMs: openrouterTimeoutMs,
      inactivityTimeoutMs: Math.min(openrouterTimeoutMs, 18_000),
      configured: openrouterConfigured,
    },
    nvidia: {
      provider: "nvidia",
      label: "NVIDIA NIM",
      model: resolveValidModelId(
        process.env.NVIDIA_MODEL,
        DEFAULT_NVIDIA_MODEL,
        "nvidia"
      ),
      timeoutMs: nvidiaTimeoutMs,
      inactivityTimeoutMs: Math.min(nvidiaTimeoutMs, 18_000),
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
    isLikelySecretToken(process.env.GEMINI_MODEL)
      ? process.env.GEMINI_MODEL
      : undefined,
    isLikelySecretToken(process.env.OPENROUTER_MODEL)
      ? process.env.OPENROUTER_MODEL
      : undefined,
    isLikelySecretToken(process.env.NVIDIA_MODEL)
      ? process.env.NVIDIA_MODEL
      : undefined,
  ];
  for (const secret of secretCandidates) {
    if (secret && secret.trim().length >= 8) {
      sanitized = sanitized.split(secret.trim()).join("[REDACTED]");
    }
  }

  sanitized = sanitized
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, "Bearer [REDACTED]")
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[REDACTED_GEMINI_KEY]")
    .replace(/AQ\.[0-9A-Za-z\-_.]{12,}/g, "[REDACTED_GOOGLE_KEY]")
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

  let httpStatus: number | null = null;
  if (err && typeof err === "object") {
    const maybeStatus =
      (err as { status?: unknown }).status ??
      (err as { statusCode?: unknown }).statusCode ??
      (err as { httpStatus?: unknown }).httpStatus;
    if (
      typeof maybeStatus === "number" &&
      maybeStatus >= 100 &&
      maybeStatus <= 599
    ) {
      httpStatus = maybeStatus;
    }
  }
  if (httpStatus === null) {
    const statusMatch = cleanMsg.match(
      /\b(?:HTTP|status|code)\s*[:=]?\s*(4\d\d|5\d\d)\b/i
    );
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
 * Executa uma tentativa assíncrona com:
 * - `Promise.race()` explícito (encerra imediatamente a Promise mesmo se a biblioteca ignorar o `AbortSignal`)
 * - `AbortController` 100% independente por tentativa
 * - Proteção `isSettled` contra resolução/rejeição tardia de tentativas já encerradas
 * - Limpeza determinística de todos os timers e listeners em `finally`
 */
export async function runWithAttemptTimeout<T>(options: {
  totalTimeoutMs: number;
  inactivityTimeoutMs: number;
  clientSignal?: AbortSignal;
  executor: (
    signal: AbortSignal,
    notifyActivity: (receivedCharsDelta?: number) => void,
    isAttemptSettled: () => boolean
  ) => Promise<T>;
}): Promise<T> {
  const { totalTimeoutMs, inactivityTimeoutMs, clientSignal, executor } =
    options;

  if (clientSignal?.aborted) {
    throw new ProviderCallError(
      "Requisição cancelada pelo cliente antes de iniciar a tentativa.",
      "cancelled",
      499
    );
  }

  const attemptController = new AbortController();
  let settled = false;
  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let clientListenerAttached = false;

  const isAttemptSettled = () => settled || attemptController.signal.aborted;

  const clearAttemptTimers = () => {
    if (totalTimer !== null) {
      clearTimeout(totalTimer);
      totalTimer = null;
      activeTimerCount = Math.max(0, activeTimerCount - 1);
    }
    if (inactivityTimer !== null) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
      activeTimerCount = Math.max(0, activeTimerCount - 1);
    }
  };

  let triggerInterrupt: ((err: ProviderCallError) => void) | null = null;

  const armInactivityTimer = () => {
    if (settled || attemptController.signal.aborted) return;
    if (inactivityTimer !== null) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
      activeTimerCount = Math.max(0, activeTimerCount - 1);
    }
    inactivityTimer = setTimeout(() => {
      if (settled) return;
      const err = new ProviderCallError(
        `Tempo limite de inatividade excedido (${inactivityTimeoutMs}ms sem resposta).`,
        "timeout",
        504
      );
      triggerInterrupt?.(err);
    }, inactivityTimeoutMs);
    activeTimerCount++;
  };

  const safeNotifyActivity = () => {
    if (settled || attemptController.signal.aborted) return;
    armInactivityTimer();
  };

  const onClientAbort = () => {
    if (settled) return;
    const err = new ProviderCallError(
      "Operação cancelada pelo usuário.",
      "cancelled",
      499
    );
    triggerInterrupt?.(err);
  };

  const interruptPromise = new Promise<never>((_resolve, reject) => {
    triggerInterrupt = (err: ProviderCallError) => {
      if (settled) return;
      settled = true;
      clearAttemptTimers();
      if (!attemptController.signal.aborted) {
        try {
          attemptController.abort(err);
        } catch {
          // Ignora falhas ao sinalizar abort em controladores já abortados
        }
      }
      reject(err);
    };
  });

  totalTimer = setTimeout(() => {
    if (settled) return;
    const err = new ProviderCallError(
      `Tempo limite excedido (${totalTimeoutMs}ms máx).`,
      "timeout",
      504
    );
    triggerInterrupt?.(err);
  }, totalTimeoutMs);
  activeTimerCount++;

  armInactivityTimer();

  if (clientSignal) {
    clientSignal.addEventListener("abort", onClientAbort, { once: true });
    clientListenerAttached = true;
    activeClientListenerCount++;
  }

  activeAttemptCount++;

  // Executa a operação protegendo contra rejeição não-tratada tardia caso o Promise.race encerre primeiro
  const guardedExecutorPromise = new Promise<T>((resolve, reject) => {
    Promise.resolve()
      .then(() =>
        executor(attemptController.signal, safeNotifyActivity, isAttemptSettled)
      )
      .then(
        (val) => {
          // Se o timeout/cancelamento já encerrou esta tentativa, ignora silenciosamente resolução tardia
          if (settled) return;
          settled = true;
          resolve(val);
        },
        (err) => {
          // Se já encerrado por timeout/cancelamento, absorve rejeição tardia para evitar UnhandledRejection
          if (settled) return;
          settled = true;
          reject(err);
        }
      );
  });

  try {
    return await Promise.race([guardedExecutorPromise, interruptPromise]);
  } finally {
    settled = true;
    clearAttemptTimers();
    if (clientSignal && clientListenerAttached) {
      clientSignal.removeEventListener("abort", onClientAbort);
      clientListenerAttached = false;
      activeClientListenerCount = Math.max(0, activeClientListenerCount - 1);
    }
    if (!attemptController.signal.aborted) {
      try {
        attemptController.abort();
      } catch {
        // noop
      }
    }
    activeAttemptCount = Math.max(0, activeAttemptCount - 1);
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
      // Desativa o p-retry interno do SDK para expor 503/429 imediatamente sem travar o orçamento
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
 * Chamada Gemini via streaming (`generateContentStream`) com eventos de progresso reais.
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
  isSettled: () => boolean;
  onChunkProgress?: (totalChars: number, activeModel: string, statusNote?: string) => void;
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
    isSettled,
    onChunkProgress,
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
    let totalChars = 0;
    for await (const chunk of stream) {
      if (signal.aborted || isSettled()) {
        throw new Error("AbortError: stream aborted");
      }
      notifyActivity();
      if (chunk.text) {
        chunks.push(chunk.text);
        totalChars += chunk.text.length;
        onChunkProgress?.(totalChars, targetModel);
      }
    }
    return chunks.join("");
  };

  const fallbackModels = [
    FALLBACK_GEMINI_LITE_MODEL,
    FALLBACK_GEMINI_MODEL,
  ].filter((m) => m !== model);

  let lastErr: unknown = null;
  const candidateChain = [model, ...fallbackModels];

  for (let idx = 0; idx < candidateChain.length; idx++) {
    const candidateModel = candidateChain[idx];
    if (signal.aborted || isSettled()) {
      throw new Error("AbortError: attempt already settled");
    }
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

      if (
        !signal.aborted &&
        !isSettled() &&
        isModelLevelFailure &&
        idx + 1 < candidateChain.length
      ) {
        const nextModel = candidateChain[idx + 1];
        notifyActivity();
        onChunkProgress?.(
          0,
          nextModel,
          `Modelo ${candidateModel} sob alta demanda. Alternando para ${nextModel}...`
        );
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("Falha nos modelos Gemini.");
}

/**
 * Lê um stream SSE OpenAI-compatible (OpenRouter / NVIDIA NIM) ou resposta JSON direta,
 * acumulando `delta.content` e emitindo progresso real.
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
  isSettled: () => boolean;
  onChunkProgress?: (totalChars: number, activeModel: string, statusNote?: string) => void;
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
    isSettled,
    onChunkProgress,
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

  // Caso um sub-provedor rejeite parâmetros opcionais (HTTP 400), refaz enxuto imediatamente
  if (
    !response.ok &&
    response.status === 400 &&
    extraBody &&
    !signal.aborted &&
    !isSettled()
  ) {
    notifyActivity();
    response = await executeFetch(undefined);
  }

  notifyActivity();

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    const classified = classifyProviderError(
      new Error(
        `${providerLabel} HTTP ${response.status}: ${errBody.slice(0, 260)}`
      )
    );
    throw new ProviderCallError(
      `${providerLabel} HTTP ${response.status}: ${errBody.slice(0, 220)}`,
      classified.errorType,
      response.status
    );
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();

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
    const resolved = data.model || model;
    if (content.length > 0) {
      onChunkProgress?.(content.length, resolved);
    }
    return {
      text: content,
      httpStatus: response.status,
      resolvedModel: resolved,
    };
  }

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
  let totalChars = 0;

  try {
    while (true) {
      if (signal.aborted || isSettled()) {
        await reader.cancel().catch(() => {});
        throw new Error("AbortError: SSE reader cancelled");
      }
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
            totalChars += piece.length;
            onChunkProgress?.(totalChars, resolvedModel);
          }
        } catch (parseErr) {
          if (parseErr instanceof ProviderCallError) {
            throw parseErr;
          }
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
 * Injeção controlada de falhas APENAS para verificação automatizada local (loopback dev).
 */
export interface ProviderSimulationFault {
  action?:
    | "timeout"
    | "ignore_abort_timeout"
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
  initialStageMessage?: string;
  systemInstruction: string;
  userPrompt: string;
  jsonFallbackReminder?: string;
  geminiSchema?: Schema;
  maxOutputTokens?: number;
  validateAndTransform: (rawText: string, provider: AIProviderId) => T;
  clientSignal?: AbortSignal;
  onProgressEvent?: (event: StreamProgressEvent) => void;
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
  notifyActivity: () => void,
  onChunkProgress?: (totalChars: number, activeModel: string, statusNote?: string) => void
): Promise<string | null> {
  if (!fault || !fault.action) return null;

  // Caso especial para Teste #3: operação que IGNORA completamente o AbortSignal
  if (fault.action === "ignore_abort_timeout") {
    await new Promise<void>(() => {
      // Intencionalmente nunca resolve nem escuta `signal` para comprovar o Promise.race()
    });
    return null;
  }

  if (fault.delayMs && fault.delayMs > 0) {
    // Emite batimentos intermediários durante delays simulados longos (Teste #2) para manter o fluxo vivo
    const sliceMs = 350;
    let remaining = fault.delayMs;
    let simulatedChars = 0;
    while (remaining > 0) {
      const wait = Math.min(sliceMs, remaining);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), wait);
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
      remaining -= wait;
      notifyActivity();
      simulatedChars += 512;
      onChunkProgress?.(simulatedChars, `${provider}-simulated`);
    }
  }

  notifyActivity();

  switch (fault.action) {
    case "timeout":
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

function getOperationActionVerb(operation: string): string {
  if (operation.includes("plan")) return "Planejando direção de arte e storyboard";
  if (operation.includes("regenerate")) return "Regenerando cena selecionada";
  if (operation.includes("render")) return "Renderizando storyboard aprovado";
  return "Gerando animação";
}

/**
 * Motor unificado de Cascata de Provedores com Orçamento Global Previsível e Eventos SSE em Tempo Real:
 * Ordem estrita: 1. Gemini -> 2. OpenRouter -> 3. NVIDIA NIM
 */
export async function executeProviderCascade<T>(
  options: ExecuteCascadeOptions<T>
): Promise<ExecuteCascadeResult<T>> {
  const {
    operation,
    mode,
    initialStageMessage,
    systemInstruction,
    userPrompt,
    jsonFallbackReminder,
    geminiSchema,
    maxOutputTokens = mode === "html" ? 16384 : 8192,
    validateAndTransform,
    clientSignal,
    onProgressEvent,
    simulationFaults,
  } = options;

  const generationId = createStableId("gen");
  const configs = getProviderConfigs(mode);
  const totalCascadeBudgetMs = getCascadeTotalBudgetMs();
  const cascadeDeadlineMs = Date.now() + totalCascadeBudgetMs;

  const attempts: ProviderAttemptDiagnostic[] = [];
  const providerOrder: AIProviderId[] = ["gemini", "openrouter", "nvidia"];

  const emitProgress = (
    partial: Omit<StreamProgressEvent, "generationId" | "operation" | "timestamp">
  ) => {
    if (!onProgressEvent) return;
    try {
      onProgressEvent({
        generationId,
        operation,
        timestamp: new Date().toISOString(),
        ...partial,
      });
    } catch {
      // Nunca permite que erro de callback de UI interrompa o pipeline
    }
  };

  emitProgress({
    type: "generation_started",
    message:
      initialStageMessage ||
      (mode === "json"
        ? "Analisando roteiro e planejando direção de arte..."
        : "Analisando roteiro e preparando composição..."),
  });

  for (let idx = 0; idx < providerOrder.length; idx++) {
    const providerId = providerOrder[idx];
    const cfg = configs[providerId];
    const fault = simulationFaults?.[providerId];

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
      emitProgress({
        type: "generation_cancelled",
        provider: providerId,
        providerLabel: cfg.label,
        message: "Geração cancelada pelo usuário.",
      });
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

    // Verifica orçamento global restante antes de iniciar a tentativa
    const remainingBudgetMs = cascadeDeadlineMs - Date.now();
    if (remainingBudgetMs < MIN_REMAINING_BUDGET_TO_START_MS) {
      const nowIso = new Date().toISOString();
      const budgetDiag: ProviderAttemptDiagnostic = {
        provider: providerId,
        providerLabel: cfg.label,
        model: cfg.model,
        startedAt: nowIso,
        endedAt: nowIso,
        durationMs: 0,
        httpStatus: 504,
        outcome: "failed",
        errorType: "timeout",
        failureReason: `Orçamento total da cascata (${totalCascadeBudgetMs}ms) esgotado antes de iniciar ${cfg.label}.`,
        userMessage: getUserFriendlyMessageForErrorType("timeout"),
      };
      attempts.push(budgetDiag);
      logStructuredAttempt(generationId, operation, idx + 1, budgetDiag);
      break;
    }

    // Se já houve falha anterior ejecutada, emite fallback_started explícito
    const prevExecutedFailure = [...attempts]
      .reverse()
      .find((a) => a.outcome === "failed");
    if (prevExecutedFailure) {
      emitProgress({
        type: "fallback_started",
        provider: providerId,
        providerLabel: cfg.label,
        model: cfg.model,
        attemptNumber: idx + 1,
        message: `${prevExecutedFailure.providerLabel} indisponível. Tentando ${cfg.label}...`,
      });
    }

    const attemptStartMs = Date.now();
    const startedAtIso = new Date(attemptStartMs).toISOString();
    const configuredAttemptTimeoutMs = fault?.timeoutOverrideMs ?? cfg.timeoutMs;
    const effectiveTimeoutMs = Math.max(
      MIN_TIMEOUT_MS,
      Math.min(configuredAttemptTimeoutMs, remainingBudgetMs)
    );
    const effectiveInactivityMs = fault?.timeoutOverrideMs
      ? effectiveTimeoutMs
      : Math.min(cfg.inactivityTimeoutMs, effectiveTimeoutMs);

    let resolvedModelName = cfg.model;

    emitProgress({
      type: "provider_started",
      provider: providerId,
      providerLabel: cfg.label,
      model: cfg.model,
      attemptNumber: idx + 1,
      message: `Conectando ao ${cfg.label} (${cfg.model})...`,
    });

    let lastProgressEmitMs = 0;
    let firstChunkAnnounced = false;
    const actionVerb = getOperationActionVerb(operation);

    const handleChunkProgress = (
      totalChars: number,
      activeModel: string,
      statusNote?: string
    ) => {
      resolvedModelName = activeModel;
      if (statusNote) {
        emitProgress({
          type: "provider_progress",
          provider: providerId,
          providerLabel: cfg.label,
          model: activeModel,
          attemptNumber: idx + 1,
          receivedChars: totalChars,
          message: statusNote,
        });
        lastProgressEmitMs = Date.now();
        return;
      }

      const now = Date.now();
      if (!firstChunkAnnounced || now - lastProgressEmitMs >= PROGRESS_THROTTLE_MS) {
        firstChunkAnnounced = true;
        lastProgressEmitMs = now;
        const kbLabel =
          totalChars >= 1024
            ? ` (${(totalChars / 1024).toFixed(1).replace(".", ",")} KB recebidos)`
            : "";
        emitProgress({
          type: "provider_progress",
          provider: providerId,
          providerLabel: cfg.label,
          model: activeModel,
          attemptNumber: idx + 1,
          receivedChars: totalChars,
          message: `${actionVerb} via ${cfg.label}${kbLabel}...`,
        });
      }
    };

    try {
      const rawOutput = await runWithAttemptTimeout<string>({
        totalTimeoutMs: effectiveTimeoutMs,
        inactivityTimeoutMs: effectiveInactivityMs,
        clientSignal,
        executor: async (signal, notifyActivity, isAttemptSettled) => {
          const simulated = await applySimulationFaultIfPresent(
            providerId,
            fault,
            signal,
            notifyActivity,
            handleChunkProgress
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
                  isSettled: isAttemptSettled,
                  onChunkProgress: handleChunkProgress,
                });
                if (!isAttemptSettled()) {
                  resolvedModelName = res.modelUsed;
                }
                return res.text;
              } catch (keyErr) {
                lastKeyErr = keyErr;
                const check = classifyProviderError(keyErr);
                const canTrySecondaryKey =
                  kIdx + 1 < geminiKeys.length &&
                  !signal.aborted &&
                  !isAttemptSettled() &&
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
              apiKey: getEffectiveOpenRouterKey(),
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
              isSettled: isAttemptSettled,
              onChunkProgress: handleChunkProgress,
            });
            if (!isAttemptSettled()) {
              resolvedModelName = res.resolvedModel;
            }
            return res.text;
          }

          // Provider 3: NVIDIA NIM
          const promptToSend =
            mode === "json" && jsonFallbackReminder
              ? `${userPrompt}\n\n${jsonFallbackReminder}`
              : userPrompt;
          const nvApiKey = getEffectiveNvidiaKey();
          try {
            const isNemotron = cfg.model.includes("nemotron");
            const res = await callOpenAICompatibleStreaming({
              endpoint: NVIDIA_CHAT_ENDPOINT,
              apiKey: nvApiKey,
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
              isSettled: isAttemptSettled,
              onChunkProgress: handleChunkProgress,
            });
            if (!isAttemptSettled()) {
              resolvedModelName = res.resolvedModel;
            }
            return res.text;
          } catch (nvPrimaryErr) {
            const check = classifyProviderError(nvPrimaryErr);
            if (
              !signal.aborted &&
              !isAttemptSettled() &&
              cfg.model !== SECONDARY_NVIDIA_MODEL &&
              (check.errorType === "http_error" ||
                check.errorType === "provider_unavailable" ||
                check.errorType === "timeout")
            ) {
              notifyActivity();
              handleChunkProgress(
                0,
                SECONDARY_NVIDIA_MODEL,
                `Alternando para modelo secundário ${SECONDARY_NVIDIA_MODEL} na NVIDIA NIM...`
              );
              const res2 = await callOpenAICompatibleStreaming({
                endpoint: NVIDIA_CHAT_ENDPOINT,
                apiKey: nvApiKey,
                model: SECONDARY_NVIDIA_MODEL,
                providerLabel: cfg.label,
                systemInstruction,
                userPrompt: promptToSend,
                maxTokens: Math.min(maxOutputTokens, 8192),
                signal,
                notifyActivity,
                isSettled: isAttemptSettled,
                onChunkProgress: handleChunkProgress,
              });
              if (!isAttemptSettled()) {
                resolvedModelName = res2.resolvedModel;
              }
              return res2.text;
            }
            throw nvPrimaryErr;
          }
        },
      });

      emitProgress({
        type: "provider_progress",
        provider: providerId,
        providerLabel: cfg.label,
        model: resolvedModelName,
        attemptNumber: idx + 1,
        receivedChars: rawOutput?.length ?? 0,
        message:
          mode === "html"
            ? "Validando animação e contrato determinístico window.seek(t)..."
            : "Validando estrutura do planejamento...",
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
      const attemptDurationMs = endedAtMs - attemptStartMs;

      const failedDiag: ProviderAttemptDiagnostic = {
        provider: providerId,
        providerLabel: cfg.label,
        model: resolvedModelName,
        startedAt: startedAtIso,
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: attemptDurationMs,
        httpStatus: classified.httpStatus,
        outcome: "failed",
        errorType: classified.errorType,
        failureReason: classified.reason,
        userMessage: getUserFriendlyMessageForErrorType(classified.errorType),
      };
      attempts.push(failedDiag);
      logStructuredAttempt(generationId, operation, idx + 1, failedDiag);

      if (classified.errorType === "cancelled" || clientSignal?.aborted) {
        emitProgress({
          type: "generation_cancelled",
          provider: providerId,
          providerLabel: cfg.label,
          model: resolvedModelName,
          durationMs: attemptDurationMs,
          message: "Geração cancelada pelo usuário.",
        });
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

      emitProgress({
        type: "provider_failed",
        provider: providerId,
        providerLabel: cfg.label,
        model: resolvedModelName,
        attemptNumber: idx + 1,
        errorType: classified.errorType,
        durationMs: attemptDurationMs,
        message: `${cfg.label}: ${getUserFriendlyMessageForErrorType(classified.errorType)}`,
      });
    }
  }

  const executedFailures = attempts.filter((a) => a.outcome === "failed");

  if (executedFailures.length === 0) {
    const authPayloadErr = new CascadeExecutionError({
      message:
        "Falha na autenticação do provedor. Verifique a configuração da API (nenhuma chave de API ativa foi encontrada no servidor).",
      generationId,
      operation,
      primaryErrorType: "auth_error",
      attempts,
      retryable: false,
      statusCode: 401,
    });
    emitProgress({
      type: "generation_failed",
      errorType: "auth_error",
      message: authPayloadErr.message,
      errorPayload: authPayloadErr.toApiErrorPayload(),
    });
    throw authPayloadErr;
  }

  const uniqueErrorTypes = new Set(
    executedFailures.map((f) => f.errorType).filter(Boolean)
  );

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

  const finalError = new CascadeExecutionError({
    message: headlineMessage,
    generationId,
    operation,
    primaryErrorType,
    attempts,
    retryable,
    statusCode,
  });

  emitProgress({
    type: "generation_failed",
    errorType: primaryErrorType,
    message: headlineMessage,
    errorPayload: finalError.toApiErrorPayload(),
  });

  throw finalError;
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
        executor: async (signal, notifyActivity, isAttemptSettled) => {
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
                  isSettled: isAttemptSettled,
                });
                effectiveModel = res.modelUsed;
                return;
              } catch (err) {
                lastErr = err;
                const check = classifyProviderError(err);
                if (
                  kIdx + 1 < keys.length &&
                  !signal.aborted &&
                  !isAttemptSettled() &&
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
              apiKey: getEffectiveOpenRouterKey(),
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
              isSettled: isAttemptSettled,
            });
            effectiveModel = res.resolvedModel;
            return;
          }
          const nvKey = getEffectiveNvidiaKey();
          try {
            const isNemotron = cfg.model.includes("nemotron");
            const res = await callOpenAICompatibleStreaming({
              endpoint: NVIDIA_CHAT_ENDPOINT,
              apiKey: nvKey,
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
              isSettled: isAttemptSettled,
            });
            effectiveModel = res.resolvedModel;
          } catch (nvErr) {
            if (
              !signal.aborted &&
              !isAttemptSettled() &&
              cfg.model !== SECONDARY_NVIDIA_MODEL
            ) {
              notifyActivity();
              const res2 = await callOpenAICompatibleStreaming({
                endpoint: NVIDIA_CHAT_ENDPOINT,
                apiKey: nvKey,
                model: SECONDARY_NVIDIA_MODEL,
                providerLabel: cfg.label,
                systemInstruction: "Reply with OK.",
                userPrompt: "Ping",
                maxTokens: 16,
                signal,
                notifyActivity,
                isSettled: isAttemptSettled,
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
