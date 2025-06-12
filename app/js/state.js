export const state = {
    activeTool: 'pencil',
    activeTimbre: 'pluck',
    lastPos: { x: 0, y: 0 },
    glissandoStart: null,
    isDrawing: false,
    isPlaying: false,
    animationFrameId: null,
    audioCtx: null,
    sourceNodes: [],
    composition: { strokes: [], symbols: [] },
    history: [],
    historyIndex: -1
};

export function saveState() {
    state.history.length = state.historyIndex + 1;
    const snapshot = JSON.parse(JSON.stringify(state.composition));
    state.history.push(snapshot);
    state.historyIndex++;
}

export function undoState() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        return true;
    }
    return false;
}

export function redoState() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        return true;
    }
    return false;
}

export function resetComposition() {
    state.composition = { strokes: [], symbols: [] };
    saveState();
}