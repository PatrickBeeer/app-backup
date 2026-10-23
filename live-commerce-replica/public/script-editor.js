/**
 * @param {Array<{id:string,start:number,end:number,text:string}>} script
 * @param {Array<{id:string,start:number,end:number,text:string}>} referenceTranscript
 * @param {Record<string,string>} drafts
 */
export function buildScriptEditorState(script, referenceTranscript = [], drafts = {}) {
  const rows = script.map((line, index) => ({
    id: line.id,
    start: line.start,
    end: line.end,
    originalText: referenceTranscript[index]?.text || '',
    savedText: line.text,
    draftText: Object.hasOwn(drafts, line.id) ? String(drafts[line.id]) : line.text
  }));
  const dirty = rows.some((row) => row.draftText !== row.savedText);
  return {
    rows,
    dirty,
    canConfirm: !dirty,
    payload: { lines: rows.map((row) => ({ id: row.id, text: row.draftText })) }
  };
}
