import { state, saveState, undoState, redoState, resetComposition } from './state.js';
import { uiElements, initUI, updateUndoRedoButtons, updateExportButtonsState, updatePlaybackUI } from './ui.js';
import { redrawAll, eraseAt } from './canvas.js';
import { initAudio, scheduleAllSounds, stopAllSounds, exportWav } from './audio.js';
import { getMousePos } from './utils.js';
import { PIXELS_PER_SECOND } from './constants.js';

// --- Handlers de Ação ---
const actionHandlers = {
    startAction(e) {
        e.preventDefault();
        initAudio();
        const pos = getMousePos(e, uiElements.drawingCanvas);
        state.lastPos = pos;
        
        switch (state.activeTool) {
            case 'pencil':
                state.isDrawing = true;
                const newStroke = {
                    id: Date.now(), points: [pos],
                    color: uiElements.colorPicker.value, lineWidth: uiElements.lineWidth.value,
                    timbre: state.activeTimbre
                };
                state.composition.strokes.push(newStroke);
                break;
            case 'eraser':
                state.isDrawing = true;
                eraseAt(pos.x, pos.y);
                break;
            case 'glissando':
                 if (!state.glissandoStart) { state.glissandoStart = pos; } 
                 else {
                    placeSymbol({ ...state.glissandoStart, endX: pos.x, endY: pos.y });
                    state.glissandoStart = null;
                }
                break;
            default:
                placeSymbol(pos);
                break;
        }
    },
    performAction(e) {
        if (!state.isDrawing) return;
        e.preventDefault();
        const pos = getMousePos(e, uiElements.drawingCanvas);
        if (state.activeTool === 'pencil') {
            const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
            currentStroke.points.push(pos);
            const { ctx } = uiElements;
            ctx.beginPath();
            ctx.moveTo(state.lastPos.x, state.lastPos.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = currentStroke.color;
            ctx.lineWidth = currentStroke.lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            state.lastPos = pos;
        } else if (state.activeTool === 'eraser') {
            eraseAt(pos.x, pos.y);
        }
    },
    stopAction(e) {
        e.preventDefault();
        if (state.isDrawing) {
            state.isDrawing = false;
            saveState();
            updateAllUI();
        }
    },
    togglePlayback() {
        if (!state.composition.strokes.length && !state.composition.symbols.length) return;
        if (state.isPlaying) stopPlayback(); else startPlayback();
    },
    handleClear() {
        if (confirm("Tem certeza de que deseja limpar toda a pauta?")) {
            resetComposition();
            redrawAll();
            updateAllUI();
        }
    },
    undo() { if (undoState()) { redrawAll(); updateAllUI(); } },
    redo() { if (redoState()) { redrawAll(); updateAllUI(); } },
    exportJpg() {
        const link = document.createElement('a');
        link.download = 'pauta-aberta.jpg';
        link.href = uiElements.drawingCanvas.toDataURL('image/jpeg', 0.9);
        link.click();
    },
    exportPdf() {
        const { jsPDF } = window.jspdf;
        const canvas = uiElements.drawingCanvas;
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'l' : 'p', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save('pauta-aberta.pdf');
    },
    exportWav: exportWav
};

// --- Funções de Lógica Principal ---
function placeSymbol(pos) {
    const symbol = {
        id: Date.now() + Math.random(),
        x: pos.x, y: pos.y, endX: pos.endX, endY: pos.endY,
        type: state.activeTool, color: uiElements.colorPicker.value,
        size: parseFloat(uiElements.lineWidth.value), timbre: state.activeTimbre
    };
    state.composition.symbols.push(symbol);
    redrawAll();
    saveState();
    updateAllUI();
}
async function startPlayback() {
    await initAudio();
    state.isPlaying = true;
    updatePlaybackUI(true);
    scheduleAllSounds(state.audioCtx);
    animatePlayhead();
}
async function stopPlayback() {
    state.isPlaying = false;
    await stopAllSounds();
    cancelAnimationFrame(state.animationFrameId);
    updatePlaybackUI(false);
}
function animatePlayhead() {
    if (!state.isPlaying) return;
    const startX = uiElements.mainCanvasArea.scrollLeft;
    const startTime = state.audioCtx.currentTime;
    function frame() {
        if (!state.isPlaying) return;
        const elapsedTime = state.audioCtx.currentTime - startTime;
        const currentX = startX + (elapsedTime * PIXELS_PER_SECOND);
        if (currentX >= uiElements.drawingCanvas.width) {
            stopPlayback();
            return;
        }
        uiElements.playhead.style.left = `${currentX}px`;
        state.animationFrameId = requestAnimationFrame(frame);
    }
    state.animationFrameId = requestAnimationFrame(frame);
}
function updateAllUI() {
    updateUndoRedoButtons();
    updateExportButtonsState();
}

// --- Ponto de Entrada da Aplicação ---
function initializeApplication(mode) {
    document.getElementById('selection-container').classList.add('hidden');
    const appWrapper = document.getElementById('app-wrapper');
    appWrapper.classList.remove('hidden');
    appWrapper.classList.add('w-full', 'h-full');

    if (mode === 'mobile') {
        document.body.classList.add('mobile-mode');
    }

    initUI(actionHandlers);
    saveState();
    updateAllUI();
}

// --- Lógica da Tela de Seleção e Inicialização ---
// Adiciona um ouvinte para garantir que o DOM esteja totalmente carregado antes de executar o script
document.addEventListener('DOMContentLoaded', () => {
    const pcModeBtn = document.getElementById('pc-mode-btn');
    const mobileModeBtn = document.getElementById('mobile-mode-btn');

    // Adiciona os listeners aos botões de seleção de modo
    if (pcModeBtn) {
        pcModeBtn.addEventListener('click', () => initializeApplication('pc'));
    }
    if (mobileModeBtn) {
        mobileModeBtn.addEventListener('click', () => initializeApplication('mobile'));
    }
});
