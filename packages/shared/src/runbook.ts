export interface RunbookChunk {
  id: string;
  text: string;
}

export interface RunbookQuestion {
  query: string;
  chunkId: string;
}
