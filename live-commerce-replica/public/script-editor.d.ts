export interface ScriptEditorLine {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface ScriptEditorRow {
  id: string;
  start: number;
  end: number;
  originalText: string;
  savedText: string;
  draftText: string;
}

export function buildScriptEditorState(
  script: ScriptEditorLine[],
  referenceTranscript?: ScriptEditorLine[],
  drafts?: Record<string, string>
): {
  rows: ScriptEditorRow[];
  dirty: boolean;
  canConfirm: boolean;
  payload: { lines: Array<{ id: string; text: string }> };
};
