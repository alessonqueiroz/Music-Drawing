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
        'main-canvas-area', 'canvas-container', 'drawingCanvas', 'y-ruler-canvas', 'y-ruler-container',
        'x-ruler-canvas', 'x-ruler-container', 'exportJpgBtn', 'exportPdfBtn',
        'exportWavBtn', 'undoBtn', 'redoBtn', 'reverb', 'delay', 'distortion',
        'exportBtn'
    ];
    ids.forEach(id => {
        const el = d.getElementById(id);
        // if (!el) console.warn(`Element with ID '${id}' not found.`);
        uiElements[id] = el;
    });
    
    // Elementos agrupados
    uiElements.tools = {
        pencil: d.getElementById('pencil'), eraser: d.getElementById('eraser'), 
        staccato: d.getElementById('staccato'), percussion: d.getElementById('percussion'), 
        arpeggio: d.getElementById('arpeggio'), glissando: d.getElementById('glissando'),
    };
    uiElements.timbres = {
        pluck: d.getElementById('pluck'), sine: d.getElementById('sine'), 
        square: d.getElementById('square'), sawtooth: d.getElementById('sawtooth'), 
        triangle: d.getElementById('triangle'), pad: d.getElementById('pad'),
        bass: d.getElementById('bass'), lead: d.getElementById('lead'), 
        noise: d.getElementById('noise'), fm: d.getElementById('fm'),
    };
    
    // Contextos de Canvas
    if (uiElements.drawingCanvas) uiElements.ctx = uiElements.drawingCanvas.getContext('2d');
    if (uiElements.yRulerCanvas) uiElements.yRulerCtx = uiElements.yRulerCanvas.getContext('2d');
    if (uiElements.xRulerCanvas) uiElements.xRulerCtx = uiElements.xRulerCanvas.getContext('2d');
}

export function initUI(eventHandlers) {
    DOMElements();
    setupEventListeners(eventHandlers);
    applyTheme(localStorage.getItem('pauta-aberta-theme') || 'dark');
    setActiveTool('pencil');
    setActiveTimbre('pluck');
    
    // Deferir o primeiro desenho para garantir que o layout CSS foi aplicado e as dimensões são calculadas
    setTimeout(resizeAndRedraw, 0); 
}

function setupEventListeners(handlers) {
    // Verifica se os elementos existem antes de adicionar listeners
    window.addEventListener('resize', resizeAndRedraw);
    
    if (uiElements.mainCanvasArea) {
        uiElements.mainCanvasArea.addEventListener('scroll', syncScroll);
    }

    const canvasEvents = {
        mousedown: handlers.startAction, mouseup: handlers.stopAction,
        mouseout: handlers.stopAction, mousemove: handlers.performAction,
        touchstart: handlers.startAction, touchend: handlers.stopAction,
        touchmove: handlers.performAction,
    };
    if (uiElements.drawingCanvas) {
        Object.entries(canvasEvents).forEach(([event, listener]) => {
            uiElements.drawingCanvas.addEventListener(event, listener, { passive: false });
        });
    }

    if (uiElements.playBtn) uiElements.playBtn.addEventListener('click', handlers.togglePlayback);
    if (uiElements.clearBtn) uiElements.clearBtn.addEventListener('click', handlers.handleClear);
    if (uiElements.themeToggle) uiElements.themeToggle.addEventListener('click', toggleTheme);
    if (uiElements.undoBtn) uiElements.undoBtn.addEventListener('click', handlers.undo);
    if (uiElements.redoBtn) uiElements.redoBtn.addEventListener('click', handlers.redo);

    // Export buttons
    if (uiElements.exportJpgBtn) uiElements.exportJpgBtn.addEventListener('click', handlers.exportJpg);
    if (uiElements.exportPdfBtn) uiElements.exportPdfBtn.addEventListener('click', handlers.exportPdf);
    if (uiElements.exportWavBtn) uiElements.exportWavBtn.addEventListener('click', handlers.exportWav);
    
    // Tool and Timbre buttons
    Object.keys(uiElements.tools).forEach(key => uiElements.tools[key]?.addEventListener('click', () => setActiveTool(key)));
    Object.keys(uiElements.timbres).forEach(key => uiElements.timbres[key]?.addEventListener('click', () => setActiveTimbre(key)));
    
    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handlers.undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); handlers.redo(); }
        if (e.key === ' ') { e.preventDefault(); handlers.togglePlayback(); }
    });
}

function syncScroll(e) {
    if(uiElements.xRulerContainer) uiElements.xRulerContainer.scrollLeft = e.target.scrollLeft;
    if(uiElements.yRulerContainer) uiElements.yRulerContainer.scrollTop = e.target.scrollTop;
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
    redrawAll(); // Redesenha para aplicar cores do tema nas réguas
}

export function setActiveTool(toolName) {
    state.activeTool = toolName;
    state.glissandoStart = null; // Reseta o início do glissando ao trocar de ferramenta
    Object.values(uiElements.tools).forEach(btn => btn?.classList.remove('active'));
    if(uiElements.tools[toolName]) uiElements.tools[toolName].classList.add('active');
    
    let cursor = 'crosshair';
    if (['staccato', 'percussion', 'arpeggio'].includes(toolName)) cursor = 'copy';
    if (toolName === 'glissando') cursor = 'pointer';
    if (toolName === 'eraser') cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)" stroke="black" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="2,2"/></svg>') 12 12, auto`;
    if(uiElements.drawingCanvas) uiElements.drawingCanvas.style.cursor = cursor;
}

export function setActiveTimbre(timbreName) {
    state.activeTimbre = timbreName;
    Object.values(uiElements.timbres).forEach(btn => btn?.classList.remove('active'));
    if(uiElements.timbres[timbreName]) uiElements.timbres[timbreName].classList.add('active');
}

export function updateUndoRedoButtons() {
    if(uiElements.undoBtn) uiElements.undoBtn.disabled = state.historyIndex <= 0;
    if(uiElements.redoBtn) uiElements.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

export function updateExportButtonsState() {
    const isEmpty = !state.composition.strokes.length && !state.composition.symbols.length;
    if (uiElements.exportBtn) uiElements.exportBtn.disabled = isEmpty;
    // Delega o estado de desabilitado para o botão principal do dropdown
    if (uiElements.exportJpgBtn) uiElements.exportJpgBtn.disabled = isEmpty;
    if (uiElements.exportPdfBtn) uiElements.exportPdfBtn.disabled = isEmpty;
    if (uiElements.exportWavBtn) uiElements.exportWavBtn.disabled = isEmpty;
}

export function showLoading(show) {
    if (uiElements.loadingOverlay) uiElements.loadingOverlay.classList.toggle('hidden', !show);
}

export function updatePlaybackUI(isPlaying) {
    if (!uiElements.playBtn) return;
    
    const span = uiElements.playBtn.querySelector('span');
    uiElements.playIcon.classList.toggle('hidden', isPlaying);
    uiElements.pauseIcon.classList.toggle('hidden', !isPlaying);
    if(span) span.textContent = isPlaying ? "Parar" : "Tocar";
    uiElements.playhead.classList.toggle('hidden', !isPlaying);
    
    if (isPlaying) {
        // Posiciona a cabeça de leitura no início visível da área de scroll
        uiElements.playhead.style.transform = `translateX(${uiElements.mainCanvasArea.scrollLeft}px)`;
    }
}