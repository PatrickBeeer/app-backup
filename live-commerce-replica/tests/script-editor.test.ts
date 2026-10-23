import { describe, expect, it } from 'vitest';
import { buildScriptEditorState } from '../public/script-editor.js';

describe('buildScriptEditorState', () => {
  it('aligns original and rewritten lines while blocking confirmation for unsaved drafts', () => {
    const state = buildScriptEditorState(
      [{ id: 'line-1', start: 0, end: 4, text: '这件短袖清爽透气' }],
      [{ id: 'speech-1', start: 0, end: 4, text: '这件长袖遮肉显瘦' }],
      { 'line-1': '这件短袖特别清爽' }
    );

    expect(state.rows).toEqual([{
      id: 'line-1', start: 0, end: 4,
      originalText: '这件长袖遮肉显瘦',
      savedText: '这件短袖清爽透气',
      draftText: '这件短袖特别清爽'
    }]);
    expect(state.dirty).toBe(true);
    expect(state.canConfirm).toBe(false);
    expect(state.payload).toEqual({ lines: [{ id: 'line-1', text: '这件短袖特别清爽' }] });
  });

  it('uses an empty original line and allows confirmation when no draft changed', () => {
    const state = buildScriptEditorState(
      [{ id: 'line-1', start: 0, end: 4, text: '新商品口播' }],
      [],
      {}
    );

    expect(state.rows[0]?.originalText).toBe('');
    expect(state.dirty).toBe(false);
    expect(state.canConfirm).toBe(true);
  });
});
