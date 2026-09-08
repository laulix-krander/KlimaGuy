import "server-only";

import { z } from "zod";

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const DEFAULT_OPENAI_TIMEOUT_MS = 15_000;

const openAiConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
  timeoutMs: z.number().int().min(1_000).max(60_000),
}).strict();

export type OpenAiProviderConfig = z.infer<typeof openAiConfigSchema>;
export type OpenAiEnvironment = Readonly<Partial<Record<"OPENAI_API_KEY" | "OPENAI_MODEL" | "OPENAI_TIMEOUT_MS", string | undefined>>>;

export type OpenAiConfigResult =
  | Readonly<{ success: true; config: OpenAiProviderConfig }>
  | Readonly<{ success: false }>;

export const readOpenAiEnvironment = (): OpenAiEnvironment => ({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_TIMEOUT_MS: process.env.OPENAI_TIMEOUT_MS,
});

export function readOpenAiProviderConfig(environment: OpenAiEnvironment = readOpenAiEnvironment()): OpenAiConfigResult {
  const timeoutValue = environment.OPENAI_TIMEOUT_MS?.trim();
  if (timeoutValue !== undefined && !/^\d+$/u.test(timeoutValue)) return { success: false };

  const parsed = openAiConfigSchema.safeParse({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    timeoutMs: timeoutValue === undefined ? DEFAULT_OPENAI_TIMEOUT_MS : Number(timeoutValue),
  });

  return parsed.success ? { success: true, config: parsed.data } : { success: false };
}
