export interface ToolErrorInit {
  userMessage: string;
  internalMessage?: string;
  status?: number;
}

export class ToolError extends Error {
  readonly userMessage: string;
  readonly internalMessage: string;
  readonly status: number | undefined;

  constructor(init: ToolErrorInit) {
    super(init.internalMessage ?? init.userMessage);
    this.name = "ToolError";
    this.userMessage = init.userMessage;
    this.internalMessage = init.internalMessage ?? init.userMessage;
    this.status = init.status;
  }

  static notFound(kind: string, id: string): ToolError {
    return new ToolError({
      userMessage: `${kind} not found`,
      internalMessage: `${kind} not found: ${id}`,
      status: 404,
    });
  }

  static validation(message: string, internal?: string): ToolError {
    return new ToolError({
      userMessage: message,
      ...(internal !== undefined ? { internalMessage: internal } : {}),
      status: 400,
    });
  }

  static upstream(status: number, safeSummary: string, internalDetail: string): ToolError {
    return new ToolError({
      userMessage: `Upstream error ${status}: ${safeSummary}`,
      internalMessage: `GHL ${status}: ${internalDetail}`,
      status,
    });
  }
}

export function isToolError(e: unknown): e is ToolError {
  return e instanceof ToolError;
}
