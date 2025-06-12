import { state } from './state.js';
import { redrawAll, resizeAndRedraw } from './canvas.js';

// Objeto para armazenar referências a todos os elementos DOM
export const uiElements = {};

// Função para popular o objeto uiElements
function DOMElements() {
    const d = document;
    const ids = [
        'playBtn', 'playIcon', 'pauseIcon', 'playhead', 'colorPicker', 'lineWidth',
        'clearBtn', 'theme-toggle', 'theme-icon-sun', 'theme-icon-moon', 'loading-overlay',
        'main-canvas-area', 'canvas-container', 'drawingCanvas', 'y-ruler-canvas',
        'x-ruler-canvas', 'x-ruler-container', 'exportJpgBtn', 'exportPdfBtn',
        'exportWavBtn', 'undoBtn', 'redoBtn', 'reverb', 'delay', 'distortion', // Efeitos adicionados
        'exportBtn'
    ];
    ids.forEach(id => uiElements[id] = d.getElementById(id));
    
    // Elementos agrupados
    uiElements.tools = {
        pencil: d.getElementById('pencil'), eraser: d.getElementById('eraser'), staccato: d.getElementById('staccato'),
        percussion: d.getElementById('percussion'), arpeggio: d.getElementById('arpeggio'), glissando: d.getElementById('glissando'),
    };
    uiElements.timbres = {
        pluck: d.getElementById('pluck'), sine: d.getElementById('sine'), square: d.getElementById('square'),
        sawtooth: d.getElementById('sawtooth'), triangle: d.getElementById('triangle'), pad: d.getElementById('pad'),
        bass: d.getElementById('bass'), lead: d.getElementById('lead'), noise: d.getElementById('noise'), fm: d.getElementById('fm'),
    };
    
    // Contextos de Canvas
    uiElements.ctx = uiElements.drawingCanvas.getContext('2d');
    uiElements.yRulerCtx = uiElements.yRulerCanvas.getContext('2d');
    uiElements.xRulerCtx = uiElements.xRulerCanvas.getContext('2d');
}

// ...dentro de app/js/ui.js

export function initUI(eventHandlers) {
    DOMElements();
    setupEventListeners(eventHandlers);
    applyTheme(localStorage.getItem('pauta-aberta-theme') || 'dark');
    setActiveTool('pencil');
    setActiveTimbre('pluck');
    
    // A chamada original:
    // resizeAndRedraw(); 

    // A chamada CORRIGIDA (garante que o DOM foi renderizado):
    setTimeout(resizeAndRedraw, 0); 
}

function setupEventListeners(handlers) {
    window.addEventListener('resize', resizeAndRedraw);
    uiElements.mainCanvasArea.addEventListener('scroll', syncScroll);

    const canvasEvents = {
        mousedown: handlers.startAction, mouseup: handlers.stopAction,
        mouseout: handlers.stopAction, mousemove: handlers.performAction,
        touchstart: handlers.startAction, touchend: handlers.stopAction,
        touchmove: handlers.performAction,
    };
    Object.entries(canvasEvents).forEach(([event, listener]) => {
        uiElements.drawingCanvas.addEventListener(event, listener, { passive: false });
    });

    uiElements.playBtn.addEventListener('click', handlers.togglePlayback);
    uiElements.clearBtn.addEventListener('click', handlers.handleClear);
    uiElements.themeToggle.addEventListener('click', toggleTheme);
    uiElements.undoBtn.addEventListener('click', handlers.undo);
    uiElements.redoBtn.addEventListener('click', handlers.redo);

    // Export buttons
    uiElements.exportJpgBtn.addEventListener('click', handlers.exportJpg);
    uiElements.exportPdfBtn.addEventListener('click', handlers.exportPdf);
    uiElements.exportWavBtn.addEventListener('click', handlers.exportWav);
    
    // Tool and Timbre buttons
    Object.keys(uiElements.tools).forEach(key => uiElements.tools[key]?.addEventListener('click', () => setActiveTool(key)));
    Object.keys(uiElements.timbres).forEach(key => uiElements.timbres[key]?.addEventListener('click', () => setActiveTimbre(key)));
    
    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handlers.undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handlers.redo(); }
    });
}

function syncScroll(e) {
    uiElements.xRulerContainer.scrollLeft = e.target.scrollLeft;
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pauta-aberta-theme', theme);
    if(uiElements.themeIconSun) uiElements.themeIconSun.classList.toggle('hidden', theme === 'dark');
    if(uiElements.themeIconMoon) uiElements.themeIconMoon.classList.toggle('hidden', theme !== 'dark');
    redrawAll();
}

export function setActiveTool(toolName) {
    state.activeTool = toolName;
    state.glissandoStart = null;
    Object.values(uiElements.tools).forEach(btn => btn?.classList.remove('active'));
    uiElements.tools[toolName]?.classList.add('active');
    
    let cursor = 'crosshair';
    if (['staccato', 'percussion', 'arpeggio'].includes(toolName)) cursor = 'copy';
    if (toolName === 'glissando') cursor = 'pointer';
    if (toolName === 'eraser') cursor = 'cell';
    uiElements.drawingCanvas.style.cursor = cursor;
}

export function setActiveTimbre(timbreName) {
    state.activeTimbre = timbreName;
    Object.values(uiElements.timbres).forEach(btn => btn?.classList.remove('active'));
    uiElements.timbres[timbreName]?.classList.add('active');
}

export function updateUndoRedoButtons() {
    uiElements.undoBtn.disabled = state.historyIndex <= 0;
    uiElements.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

export function updateExportButtonsState() {
    const isEmpty = !state.composition.strokes.length && !state.composition.symbols.length;
    uiElements.exportJpgBtn.disabled = isEmpty;
    uiElements.exportPdfBtn.disabled = isEmpty;
    uiElements.exportWavBtn.disabled = isEmpty;
    uiElements.exportBtn.disabled = isEmpty;
}

export function showLoading(show) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

export function updatePlaybackUI(isPlaying) {
    uiElements.playBtn.disabled = true;
    uiElements.playIcon.classList.toggle('hidden', isPlaying);
    uiElements.pauseIcon.classList.toggle('hidden', !isPlaying);
    uiElements.playBtn.querySelector('span').textContent = isPlaying ? "Parar" : "Tocar";
    uiElements.playhead.classList.toggle('hidden', !isPlaying);
    
    if (isPlaying) {
        uiElements.playhead.style.left = `${uiElements.mainCanvasArea.scrollLeft}px`;
    }

    setTimeout(() => { uiElements.playBtn.disabled = false; }, 300);
}
