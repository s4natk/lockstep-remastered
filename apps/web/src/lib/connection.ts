export type ConnectionState = "checking" | "live" | "mock" | "reachable" | "offline";

export function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case "live":
      return "Live";
    case "mock":
      return "Deterministic";
    case "reachable":
      return "Worker";
    case "checking":
      return "Checking";
    case "offline":
      return "Offline";
  }
}

export function connectionDetail(state: ConnectionState, model?: string): string {
  switch (state) {
    case "live":
      return model ? `Live · ${model}` : "Live OpenAI";
    case "mock":
      return "Deterministic guidance ? no provider key";
    case "reachable":
      return "Worker reachable";
    case "checking":
      return "Checking the Worker";
    case "offline":
      return "Worker offline";
  }
}
