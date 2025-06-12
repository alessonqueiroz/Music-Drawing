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
        initAudio(); // Garante que o audio context está ativo
        const pos = getMousePos(e, uiElements.drawingCanvas);
        if (!pos) return;
        state.lastPos = pos;
        
        switch (state.activeTool) {
            case 'pencil':
                state.isDrawing = true;
                const newStroke = {
                    id: Date.now(), points: [pos],
                    color: uiElements.colorPicker.value, 
                    lineWidth: uiElements.lineWidth.value,
                    timbre: state.activeTimbre
                };
                state.composition.strokes.push(newStroke);
                break;
            case 'eraser':
                state.isDrawing = true;
                eraseAt(pos.x, pos.y);
                break;
            case 'glissando':
                 if (!state.glissandoStart) { 
                     state.glissandoStart = pos; 
                 } else {
                    placeSymbol({ ...state.glissandoStart, endX: pos.x, endY: pos.y });
                    state.glissandoStart = null;
                }
                break;
            default: // Para 'staccato', 'percussion', etc.
                placeSymbol(pos);
                break;
        }
    },
    performAction(e) {
        if (!state.isDrawing) return;
        e.preventDefault();
        const pos = getMousePos(e, uiElements.drawingCanvas);
        if (!pos) return;

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
            if (state.activeTool === 'pencil' && state.composition.strokes.length > 0 && state.composition.strokes[state.composition.strokes.length - 1].points.length < 2) {
                state.composition.strokes.pop();
            }
            saveState();
            updateAllUI();
        }
    },
    togglePlayback() {
        if (!state.composition.strokes.length && !state.composition.symbols.length) return;
        if (state.isPlaying) {
            stopPlayback();
        } else {
            startPlayback();
        }
    },
    handleClear() {
        if (confirm("Tem certeza de que deseja limpar toda a pauta? Esta ação não pode ser desfeita.")) {
            stopPlayback();
            resetComposition();
            redrawAll();
            updateAllUI();
        }
    },
    undo() { if (undoState()) { redrawAll(); updateAllUI(); } },
    redo() { if (redoState()) { redrawAll(); updateAllUI(); } },
    exportJpg() {
        const link = document.createElement('a');
        link.download = 'music-drawing.jpg';
        link.href = uiElements.drawingCanvas.toDataURL('image/jpeg', 0.9);
        link.click();
    },
    exportPdf() {
        try {
            const { jsPDF } = window.jspdf;
            const canvas = uiElements.drawingCanvas;
            const imgData = canvas.toDataURL('image/png');
            const orientation = canvas.width > canvas.height ? 'l' : 'p';
            const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save('music-drawing.pdf');
        } catch(e) {
            console.error("Erro ao exportar PDF:", e);
            alert("Não foi possível exportar o PDF. Verifique se a biblioteca jsPDF foi carregada corretamente.");
        }
    },
    exportWav: exportWav
};

// --- Funções de Lógica Principal ---
function placeSymbol(pos) {
    const symbol = {
        id: Date.now() + Math.random(),
        x: pos.x, y: pos.y, endX: pos.endX, endY: pos.endY,
        type: state.activeTool, 
        color: uiElements.colorPicker.value,
        size: parseFloat(uiElements.lineWidth.value), 
        timbre: state.activeTimbre
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
    state.playbackStartTime = state.audioCtx.currentTime;
    state.playbackStartScroll = uiElements.mainCanvasArea.scrollLeft;
    animatePlayhead();
}
async function stopPlayback() {
    state.isPlaying = false;
    if (state.audioCtx) {
        await stopAllSounds();
    }
    if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
    }
    updatePlaybackUI(false);
}

function animatePlayhead() {
    if (!state.isPlaying) return;

    const elapsedTime = state.audioCtx.currentTime - state.playbackStartTime;
    const currentX = state.playbackStartScroll + (elapsedTime * PIXELS_PER_SECOND);
    
    uiElements.playhead.style.transform = `translateX(${currentX}px)`;

    if (currentX > uiElements.mainCanvasArea.scrollLeft + uiElements.mainCanvasArea.clientWidth * 10.0) {
        uiElements.mainCanvasArea.scrollLeft = currentX - uiElements.mainCanvasArea.clientWidth * 10.0;
    }

    if (currentX >= uiElements.drawingCanvas.width) {
        stopPlayback();
        return;
    }
    
    // CORREÇÃO: A função agora chama a si mesma para criar o loop de animação.
    state.animationFrameId = requestAnimationFrame(animatePlayhead);
}

function updateAllUI() {
    updateUndoRedoButtons();
    updateExportButtonsState();
}

// --- Ponto de Entrada da Aplicação ---
function initializeApplication(mode = 'pc') {
    const selectionContainer = document.getElementById('selection-container');
    const appWrapper = document.getElementById('app-wrapper');

    if (selectionContainer) {
        selectionContainer.classList.add('hidden');
    }
    if (appWrapper) {
        appWrapper.classList.remove('hidden');
        // As classes 'w-full' e 'h-full' já estão no HTML, não precisa adicionar aqui
    }

    if (mode === 'mobile') {
        document.body.classList.add('mobile-mode');
    }

    initUI(actionHandlers);
    saveState();
    updateAllUI();
}

// --- Lógica de Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    const pcModeBtn = document.getElementById('pc-mode-btn');
    const mobileModeBtn = document.getElementById('mobile-mode-btn');
    const appWrapper = document.getElementById('app-wrapper'); // Pega o wrapper principal

    if (pcModeBtn && mobileModeBtn) {
        // Esconde o app principal inicialmente
        if (appWrapper) appWrapper.classList.add('hidden'); 
        
        pcModeBtn.addEventListener('click', () => initializeApplication('pc'));
        mobileModeBtn.addEventListener('click', () => initializeApplication('mobile'));
    } else {
        // Se a tela de seleção não existir, inicializa o app diretamente
        initializeApplication();
    }
});