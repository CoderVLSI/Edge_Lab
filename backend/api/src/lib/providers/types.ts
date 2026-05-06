export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt: string;
  model: string;
  maxTokens?: number;
}

/** Each provider returns an async iterable of text chunks */
export interface AIProvider {
  id: string;
  name: string;
  models: ModelInfo[];
  isAvailable: () => boolean;
  stream(req: ChatRequest): AsyncIterable<string>;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  notes?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  available: boolean;
  models: ModelInfo[];
}
