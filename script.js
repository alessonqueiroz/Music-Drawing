const d = document;
const { jsPDF } = window.jspdf;

// --- CONSTANTS ---
const MAX_DURATION_SECONDS = 600; // 10 minutes
const PIXELS_PER_SECOND = 100;
const FREQ_MIN = 100;
const FREQ_MAX = 2000;
const ERASE_RADIUS = 20;
const AUTOSAVE_KEY = 'music-drawing-autosave';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.1;

// --- DOM ELEMENTS ---
const el = {
    playBtn: d.getElementById('playBtn'), playIcon: d.getElementById('playIcon'), pauseIcon: d.getElementById('pauseIcon'), playBtnText: d.querySelector('#playBtn span'),
    resetViewBtn: d.getElementById('resetViewBtn'),
    playhead: d.getElementById('playhead'), colorPicker: d.getElementById('colorPicker'), lineWidth: d.getElementById('lineWidth'),
    clearBtn: d.getElementById('clearBtn'),
    reverbSlider: d.getElementById('reverb'),
    delayTimeSlider: d.getElementById('delayTime'),
    delayFeedbackSlider: d.getElementById('delayFeedback'),
    themeToggle: d.getElementById('theme-toggle'),
    themeSun: d.getElementById('theme-icon-sun'), themeMoon: d.getElementById('theme-icon-moon'),
    loadingOverlay: d.getElementById('loading-overlay'),

    saveProjectBtn: d.getElementById('saveProjectBtn'),
    importProjectBtn: d.getElementById('importProjectBtn'),
    drawmusImporter: d.getElementById('drawmusImporter'),

    exportBtn: d.getElementById('exportBtn'), // Referência ao botão principal
    exportJpgBtn: d.getElementById('exportJpgBtn'), exportPdfBtn: d.getElementById('exportPdfBtn'), exportWavBtn: d.getElementById('exportWavBtn'),
    undoBtn: d.getElementById('undoBtn'), redoBtn: d.getElementById('redoBtn'),
    zoomInBtn: d.getElementById('zoomInBtn'),
    zoomOutBtn: d.getElementById('zoomOutBtn'),

    canvas: d.getElementById('drawingCanvas'),
    canvasContainer: d.getElementById('canvas-container'),
    mainCanvasArea: d.getElementById('main-canvas-area'),
    yRulerCanvas: d.getElementById('y-ruler-canvas'),
    xRulerCanvas: d.getElementById('x-ruler-canvas'),
    xRulerContainer: d.getElementById('x-ruler-container'),
    yRulerContainer: d.getElementById('y-ruler-container'),

    exportSelectionOverlay: d.getElementById('export-selection-overlay'),
    exportStartHandle: d.getElementById('export-start-handle'),
    exportEndHandle: d.getElementById('export-end-handle'),

    tools: { select: d.getElementById('select'), pencil: d.getElementById('pencil'), eraser: d.getElementById('eraser'), hand: d.getElementById('hand'), glissando: d.getElementById('glissando'), staccato: d.getElementById('staccato'), percussion: d.getElementById('percussion'), arpeggio: d.getElementById('arpeggio'), granular: d.getElementById('granular'), tremolo: d.getElementById('tremolo'), filter: d.getElementById('filter'), delay: d.getElementById('delay') },
    timbres: { sine: d.getElementById('sine'), square: d.getElementById('square'), sawtooth: d.getElementById('sawtooth'), triangle: d.getElementById('triangle'), fm: d.getElementById('fm'), pulse: d.getElementById('pulse') }
};

const ctx = el.canvas.getContext('2d');
const yRulerCtx = el.yRulerCanvas.getContext('2d');
const xRulerCtx = el.xRulerCanvas.getContext('2d');

// --- STATE MANAGEMENT ---
let state = {
    isDrawing: false,
    isSelecting: false,
    isMoving: false,
    selectionStart: null,
    selectionEnd: null,
    activeTool: 'pencil',
    activeTimbre: 'sine',
    lastPos: { x: 0, y: 0 },
    glissandoStart: null,
    isPlaying: false,
    playbackStartTime: 0,
    animationFrameId: null,
    audioCtx: null,
    sourceNodes: [],
    composition: { strokes: [], symbols: [] },
    history: [],
    historyIndex: -1,
    selectedElements: [],
    zoomLevel: 1.0,

    exportStartTime: 0,
    exportEndTime: 5,
    isDraggingStart: false,
    isDraggingEnd: false,
    isDraggingPlayhead: false,
};
let clipboard = [];

// --- CORE FUNCTIONS ---

function initApp(mode = 'pc') {
    const backgroundAudio = d.getElementById('background-audio');
    if (backgroundAudio && !backgroundAudio.paused) {
        backgroundAudio.pause();
        backgroundAudio.currentTime = 0; }
    d.getElementById('selection-container')?.classList.add('hidden');
     d.getElementById('app-wrapper')?.classList.remove('hidden');

    if (mode === 'mobile') {
        d.body.classList.add('mobile-mode');
        setupMobileToolbar(); // <-- CORREÇÃO: Chamada da função para ativar as abas mobile
    }

    loadAutoSavedProject();
    setupEventListeners();
    applyTheme(localStorage.getItem('music-drawing-theme') || 'dark');
    setActiveTool('pencil');
    setActiveTimbre('sine');

    setTimeout(() => {
        resizeAndRedraw();
        if (state.history.length === 0) {
            saveState(true);
        }
    }, 100);
}

function resizeAndRedraw() {
    const canvasWidth = MAX_DURATION_SECONDS * PIXELS_PER_SECOND;
    const canvasHeight = el.mainCanvasArea.offsetHeight;

    if(canvasHeight <= 0) {
        setTimeout(resizeAndRedraw, 100);
        return;
    }

    el.canvas.width = canvasWidth;
    el.canvas.height = canvasHeight;
    el.canvasContainer.style.width = `${canvasWidth}px`;
    el.canvasContainer.style.height = `${canvasHeight}px`;

    el.yRulerCanvas.width = el.yRulerContainer.offsetWidth;
    el.yRulerCanvas.height = canvasHeight;

    el.xRulerCanvas.width = canvasWidth;
    el.xRulerCanvas.height = el.xRulerContainer.offsetHeight;

    redrawAll();
}

function redrawAll() {
    ctx.clearRect(0, 0, el.canvas.width / state.zoomLevel, el.canvas.height / state.zoomLevel);

    ctx.save();
    ctx.scale(state.zoomLevel, state.zoomLevel);

    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    });
    state.composition.symbols.forEach(s => drawSymbol(s));

    if (state.isSelecting) {
        drawMarquee();
    }

    state.selectedElements.forEach(elementId => {
        const element = findElementById(elementId);
        if (element) {
            drawSelectionIndicator(element);
        }
    });

    ctx.restore();
    drawRulers();
    updateExportSelectionVisuals();
}

function drawRulers() {
    xRulerCtx.clearRect(0, 0, el.xRulerCanvas.width, el.xRulerCanvas.height);
    yRulerCtx.clearRect(0, 0, el.yRulerCanvas.width, el.yRulerCanvas.height);

    const textColor = getComputedStyle(d.documentElement).getPropertyValue('--text-dark').trim();
    const rulerFont = '9px Inter';

    // X-Ruler (Time)
    xRulerCtx.fillStyle = textColor;
    xRulerCtx.font = rulerFont;
    xRulerCtx.textAlign = 'center';
    xRulerCtx.textBaseline = 'top';

    const xScroll = el.mainCanvasArea.scrollLeft;
    const xZoom = state.zoomLevel;
    const startSec = Math.floor(xScroll / (PIXELS_PER_SECOND * xZoom));
    const endSec = Math.ceil((xScroll + el.mainCanvasArea.offsetWidth) / (PIXELS_PER_SECOND * xZoom));

    for (let sec = startSec; sec <= endSec; sec++) {
        const xPos = (sec * PIXELS_PER_SECOND * xZoom) - xScroll;

        let isMajorTick = false;
        if (xZoom > 2) isMajorTick = (sec % 1 === 0);
        else if (xZoom > 0.5) isMajorTick = (sec % 5 === 0);
        else isMajorTick = (sec % 10 === 0);

        if (isMajorTick) {
            xRulerCtx.fillRect(xPos, 0, 1, 10);
            xRulerCtx.fillText(`${sec}s`, xPos, 12);
        } else {
             xRulerCtx.fillRect(xPos, 0, 1, 5);
        }
    }

    // --- Y-Ruler (Frequency) ---
    yRulerCtx.fillStyle = textColor;
    yRulerCtx.font = rulerFont;
    yRulerCtx.textAlign = 'right';
    yRulerCtx.textBaseline = 'middle';

    const yScroll = el.mainCanvasArea.scrollTop;
    const yZoom = state.zoomLevel;

    let minorStep, majorStep;
    if (yZoom < 0.75) {
        minorStep = 200;
        majorStep = 400;
    } else if (yZoom < 1.5) {
        minorStep = 100;
        majorStep = 200;
    } else if (yZoom < 3.0) {
        minorStep = 50;
        majorStep = 100;
    } else {
        minorStep = 20;
        majorStep = 100;
    }

    const drawnLabels = [];
    const loopIncrement = minorStep / 2;

    for (let freq = FREQ_MIN; freq <= FREQ_MAX; freq += loopIncrement) {

        let isMajor = freq % majorStep === 0;
        let isMinor = freq % minorStep === 0;

        if (!isMajor && !isMinor) continue;

        const yPos = (yFromFrequency(freq) * yZoom) - yScroll;

        if (yPos < -10 || yPos > el.yRulerCanvas.height + 10) continue;


        if (isMajor) {
            let collision = false;
            for (const drawnY of drawnLabels) {
                if (Math.abs(drawnY - yPos) < 12) {
                    collision = true;
                    break;
                }
            }

            if (!collision) {
                yRulerCtx.fillRect(el.yRulerCanvas.width - 15, yPos, 15, 1);
                yRulerCtx.fillText(`${Math.round(freq)}`, el.yRulerCanvas.width - 20, yPos);
                drawnLabels.push(yPos);
            } else {
                yRulerCtx.fillRect(el.yRulerCanvas.width - 10, yPos, 10, 1);
            }
        } else if (isMinor) {
            yRulerCtx.fillRect(el.yRulerCanvas.width - 7, yPos, 7, 1);
        }
    }
}

function setupMobileToolbar() {
    const tabs = d.querySelectorAll('#mobile-toolbar-tabs .toolbar-tab');
    const panels = d.querySelectorAll('#panels-container .toolbar-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPanelId = tab.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            d.querySelector(`.toolbar-panel[data-panel="${targetPanelId}"]`).classList.add('active');
        });
    });
}

// --- EVENT HANDLING ---
function setupEventListeners() {
    window.addEventListener('resize', resizeAndRedraw);
    el.mainCanvasArea.addEventListener('scroll', redrawAll);
    el.xRulerCanvas.addEventListener('click', handleTimelineClick);

    const canvasEvents = {
        'mousedown': startAction, 'mouseup': stopAction, 'mouseleave': stopAction, 'mousemove': performAction,
        'touchstart': startAction, 'touchend': stopAction, 'touchcancel': stopAction, 'touchmove': performAction
    };
    Object.entries(canvasEvents).forEach(([event, listener]) => {
        el.canvas.addEventListener(event, listener, { passive: false });
    });

    el.playBtn.addEventListener('click', togglePlayback);
    el.resetViewBtn.addEventListener('click', resetView);
    el.clearBtn.addEventListener('click', handleClear);
    el.themeToggle.addEventListener('click', () => applyTheme(d.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

    Object.keys(el.tools).forEach(key => el.tools[key]?.addEventListener('click', () => setActiveTool(key)));
    Object.keys(el.timbres).forEach(key => el.timbres[key]?.addEventListener('click', () => setActiveTimbre(key)));

    el.zoomInBtn.addEventListener('click', () => handleZoom(true));
    el.zoomOutBtn.addEventListener('click', () => handleZoom(false));

    el.saveProjectBtn.addEventListener('click', saveProject);
    el.importProjectBtn.addEventListener('click', () => el.drawmusImporter.click());
    el.drawmusImporter.addEventListener('change', importProject);

    el.exportJpgBtn.addEventListener('click', exportJpg);
    el.exportPdfBtn.addEventListener('click', exportPdf);
    el.exportWavBtn.addEventListener('click', exportWav);

    el.undoBtn.addEventListener('click', undo);
    el.redoBtn.addEventListener('click', redo);

    // --- CORREÇÃO: Adicionando eventos de toque para os puxadores de exportação ---
    el.exportStartHandle.addEventListener('mousedown', () => { state.isDraggingStart = true; });
    el.exportEndHandle.addEventListener('mousedown', () => { state.isDraggingEnd = true; });
    el.exportStartHandle.addEventListener('touchstart', (e) => { e.preventDefault(); state.isDraggingStart = true; }, { passive: false });
    el.exportEndHandle.addEventListener('touchstart', (e) => { e.preventDefault(); state.isDraggingEnd = true; }, { passive: false });

    window.addEventListener('mousemove', handleExportDrag);
    window.addEventListener('touchmove', handleExportDrag, { passive: false });

    const stopExportDrag = () => {
        state.isDraggingStart = false;
        state.isDraggingEnd = false;
    };
    window.addEventListener('mouseup', stopExportDrag);
    window.addEventListener('touchend', stopExportDrag);
    window.addEventListener('touchcancel', stopExportDrag);
    // --- Fim da Correção ---

    el.playhead.addEventListener('mousedown', startPlayheadDrag);
    window.addEventListener('mousemove', handlePlayheadDrag);
    window.addEventListener('mouseup', stopPlayheadDrag);
    el.playhead.addEventListener('touchstart', startPlayheadDrag, { passive: false });
    window.addEventListener('touchmove', handlePlayheadDrag, { passive: false });
    window.addEventListener('touchend', stopPlayheadDrag);

    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const isCtrlCmd = e.ctrlKey || e.metaKey;

        if (isCtrlCmd && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            handleZoom(true);
        } else if (isCtrlCmd && e.key === '-') {
            e.preventDefault();
            handleZoom(false);
        } else if (isCtrlCmd && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copySelectedElements();
        } else if (isCtrlCmd && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            pasteElements();
        } else if (isCtrlCmd && e.key === 'z') {
            e.preventDefault();
            undo();
        } else if (isCtrlCmd && e.key === 'y') {
            e.preventDefault();
            redo();
        } else if (isCtrlCmd && e.key === 's') {
            e.preventDefault();
            saveProject();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedElements();
        } else if (e.key === ' ' && e.target === d.body) {
            e.preventDefault();
            togglePlayback();
        }
    });
}

function getEventPos(e) {
    const rect = el.mainCanvasArea.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left + el.mainCanvasArea.scrollLeft) / state.zoomLevel;
    const y = (clientY - rect.top + el.mainCanvasArea.scrollTop) / state.zoomLevel;

    return { x, y };
}

function startAction(e) {
    if (e.target === el.playhead) return;

    e.preventDefault();
    initAudio();
    const pos = getEventPos(e);
    state.lastPos = pos;
    state.isDrawing = true;

    switch (state.activeTool) {
        case 'select': {
            const clickedElement = getElementAtPos(pos);
            const isAlreadySelected = clickedElement && state.selectedElements.includes(clickedElement.id);

            if (isAlreadySelected) {
                state.isMoving = true;
                el.canvas.style.cursor = 'move';
            } else {
                state.isMoving = false;
                const isMultiSelect = e.ctrlKey || e.metaKey;
                if (clickedElement) {
                    state.isSelecting = false;
                    if (isMultiSelect) {
                        state.selectedElements.push(clickedElement.id);
                    } else {
                        state.selectedElements = [clickedElement.id];
                    }
                } else {
                    state.isSelecting = true;
                    state.selectionStart = pos;
                    state.selectionEnd = pos;
                    if (!isMultiSelect) {
                        state.selectedElements = [];
                    }
                }
            }
            redrawAll();
            break;
        }
        case 'pencil':
            const newStroke = { id: Date.now(), points: [pos], color: el.colorPicker.value, lineWidth: el.lineWidth.value, timbre: state.activeTimbre };
            state.composition.strokes.push(newStroke);
            break;
        case 'eraser':
            eraseAt(pos.x, pos.y);
            break;
        case 'hand':
            el.canvas.style.cursor = 'grabbing';
            break;
        case 'glissando':
            if (!state.glissandoStart) {
                state.glissandoStart = pos;
            } else {
                placeSymbol({ ...state.glissandoStart, endX: pos.x, endY: pos.y });
                state.glissandoStart = null;
            }
            break;
        default:
            placeSymbol(pos);
            break;
    }
}

function stopAction(e) {
    if (!state.isDrawing) return;
    e.preventDefault();

    if (state.isMoving) {
        state.isMoving = false;
        el.canvas.style.cursor = 'pointer';
        saveState();
    }

    if (state.isSelecting) {
        const r1 = {
            x: state.selectionStart.x,
            y: state.selectionStart.y,
            width: state.selectionEnd.x - state.selectionStart.x,
            height: state.selectionEnd.y - state.selectionStart.y,
        };

        const allElements = [...state.composition.strokes, ...state.composition.symbols];
        allElements.forEach(element => {
            const r2 = getElementBoundingBox(element);
            if (doRectsIntersect(r1, r2)) {
                if (!state.selectedElements.includes(element.id)) {
                    state.selectedElements.push(element.id);
                }
            }
        });
        state.isSelecting = false;
        redrawAll();
    }

    state.isDrawing = false;

    if (state.activeTool === 'hand') {
        setActiveTool('hand');
        return;
    }
    if (['select', 'glissando'].includes(state.activeTool)) {
        return;
    }

    ctx.beginPath();
    const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
    if (currentStroke && currentStroke.points.length > 200) {
       currentStroke.points = simplify(currentStroke.points, 0.5, true);
    }
    if (state.activeTool !== 'eraser') {
      saveState();
    }
}

function performAction(e) {
    if (state.isDraggingPlayhead) return;
    if (!state.isDrawing) return;
    e.preventDefault();
    const pos = getEventPos(e);

    if (state.isMoving) {
        const dx = pos.x - state.lastPos.x;
        const dy = pos.y - state.lastPos.y;
        moveSelectedElements(dx, dy);
        state.lastPos = pos;
        redrawAll();
        return;
    }

    if (state.isSelecting) {
        state.selectionEnd = pos;
        redrawAll();
        return;
    }

    if (state.activeTool === 'hand') {
        const rawPos = { x: e.touches ? e.touches[0].clientX : e.clientX, y: e.touches ? e.touches[0].clientY : e.clientY };
        const rawLastPos = { x: state.lastPos.rawX, y: state.lastPos.rawY };
        if(rawLastPos.x){
            const dx = rawPos.x - rawLastPos.x;
            const dy = rawPos.y - rawLastPos.y;
            el.mainCanvasArea.scrollLeft -= dx;
            el.mainCanvasArea.scrollTop -= dy;
        }
        state.lastPos.rawX = rawPos.x;
        state.lastPos.rawY = rawPos.y;
        return;
    } else {
        state.lastPos.rawX = null;
        state.lastPos.rawY = null;
    }

    if (state.activeTool === 'pencil') {
        const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
        if (!currentStroke) return;
        currentStroke.points.push(pos);
        redrawAll();
        state.lastPos = pos;
    } else if (state.activeTool === 'eraser') {
        eraseAt(pos.x, pos.y);
    }
}

function handleZoom(zoomIn) {
    const oldZoom = state.zoomLevel;
    let newZoom = oldZoom + (zoomIn ? ZOOM_STEP : -ZOOM_STEP) * oldZoom;
    newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));

    if (newZoom === oldZoom) return;

    const viewCenterX = el.mainCanvasArea.scrollLeft + el.mainCanvasArea.offsetWidth / 2;
    const viewCenterY = el.mainCanvasArea.scrollTop + el.mainCanvasArea.offsetHeight / 2;

    const pointX = viewCenterX / oldZoom;
    const pointY = viewCenterY / oldZoom;

    state.zoomLevel = newZoom;
    el.canvasContainer.style.transform = `scale(${newZoom})`;
    el.canvasContainer.style.transformOrigin = '0 0';

    const newScrollX = pointX * newZoom - el.mainCanvasArea.offsetWidth / 2;
    const newScrollY = pointY * newZoom - el.mainCanvasArea.offsetHeight / 2;

    el.mainCanvasArea.scrollLeft = newScrollX;
    el.mainCanvasArea.scrollTop = newScrollY;

    redrawAll();
}

function handleTimelineClick(e) {
    if (state.isPlaying) {
        stopPlayback();
    }

    const rect = el.xRulerCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;

    const canvasX = (clickX + el.mainCanvasArea.scrollLeft) / state.zoomLevel;

    let newStartTime = canvasX / PIXELS_PER_SECOND;
    newStartTime = Math.max(0, Math.min(newStartTime, MAX_DURATION_SECONDS));

    state.playbackStartTime = newStartTime;

    updatePlayheadPosition();

    el.mainCanvasArea.scrollLeft = (state.playbackStartTime * PIXELS_PER_SECOND * state.zoomLevel) - (el.mainCanvasArea.offsetWidth / 4);

    redrawAll();
}

// --- Funções de arrastar o Playhead ---
function startPlayheadDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (state.isPlaying) {
        stopPlayback();
    }
    state.isDraggingPlayhead = true;
    d.body.style.cursor = 'ew-resize';
}

function handlePlayheadDrag(e) {
    if (!state.isDraggingPlayhead) return;
    e.preventDefault();

    const rect = el.mainCanvasArea.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPosOnCanvasArea = clientX - rect.left;

    const canvasX = (xPosOnCanvasArea + el.mainCanvasArea.scrollLeft) / state.zoomLevel;

    let newStartTime = canvasX / PIXELS_PER_SECOND;
    newStartTime = Math.max(0, Math.min(newStartTime, MAX_DURATION_SECONDS));

    state.playbackStartTime = newStartTime;
    updatePlayheadPosition();
}

function stopPlayheadDrag() {
    if (state.isDraggingPlayhead) {
        state.isDraggingPlayhead = false;
        d.body.style.cursor = 'default';
        setActiveTool(state.activeTool); // Restaura o cursor da ferramenta
    }
}

function updatePlayheadPosition() {
    const playheadX = state.playbackStartTime * PIXELS_PER_SECOND;
    el.playhead.style.transform = `translateX(${playheadX}px)`;
    el.playhead.classList.remove('hidden');
}


// --- DRAWING & COMPOSITION ---
function handleClear() {
    if (confirm("Tem certeza de que deseja limpar toda a pauta? Esta ação não pode ser desfeita.")) {
        state.composition = { strokes: [], symbols: [] };
        state.selectedElements = [];
        state.history = [];
        state.historyIndex = -1;
        saveState(true);
        redrawAll();
    }
}

function placeSymbol(pos) {
    const symbol = {
        id: Date.now() + Math.random(),
        x: pos.x, y: pos.y, endX: pos.endX, endY: pos.endY,
        type: state.activeTool,
        color: el.colorPicker.value,
        size: parseFloat(el.lineWidth.value),
        timbre: state.activeTimbre
    };
    state.composition.symbols.push(symbol);
    drawSymbol(symbol);
    saveState();
}

function drawSymbol(s) {
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    const size = s.size;
    ctx.lineWidth = Math.max(2, size / 10);

    switch(s.type) {
        case 'staccato': ctx.beginPath(); ctx.arc(s.x, s.y, size / 4, 0, 2 * Math.PI); ctx.fill(); break;
        case 'percussion': ctx.beginPath(); ctx.moveTo(s.x - size/2, s.y - size/2); ctx.lineTo(s.x + size/2, s.y + size/2); ctx.moveTo(s.x + size/2, s.y - size/2); ctx.lineTo(s.x - size/2, s.y + size/2); ctx.stroke(); break;
        case 'glissando': ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.endX, s.endY); ctx.stroke(); break;
        case 'arpeggio': ctx.lineWidth = Math.max(2, size / 15); ctx.beginPath(); ctx.moveTo(s.x - size, s.y + size/2); ctx.bezierCurveTo(s.x - size/2, s.y - size, s.x + size/2, s.y + size, s.x + size, s.y-size/2); ctx.stroke(); break;
        case 'granular': ctx.globalAlpha = 0.5; ctx.fillStyle = s.color; ctx.fillRect(s.x - size, s.y - size/2, size*2, size); ctx.globalAlpha = 1.0; break;
        case 'tremolo': ctx.beginPath(); ctx.moveTo(s.x - size, s.y); ctx.lineTo(s.x - size/2, s.y - size/2); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x + size/2, s.y + size/2); ctx.lineTo(s.x + size, s.y); ctx.stroke(); break;
        case 'filter':
        case 'delay':
            ctx.globalAlpha = 0.2; ctx.fillStyle = s.color; ctx.fillRect(s.x, 0, size * 2, el.canvas.height); ctx.globalAlpha = 1.0; ctx.beginPath(); ctx.moveTo(s.x, s.y - size/2); ctx.lineTo(s.x, s.y + size/2); ctx.lineTo(s.x + 10, s.y); ctx.closePath(); ctx.fillStyle = s.color; ctx.fill(); break;
    }
    ctx.restore();
}

function eraseAt(x, y) {
    let somethingWasErased = false;
    const eraseRadiusSquared = ERASE_RADIUS * ERASE_RADIUS;

    const initialSymbolCount = state.composition.symbols.length;
    state.composition.symbols = state.composition.symbols.filter(s => ((s.x - x)**2 + (s.y - y)**2) > eraseRadiusSquared);
    if (state.composition.symbols.length < initialSymbolCount) somethingWasErased = true;

    state.composition.strokes.forEach(stroke => {
        const initialLength = stroke.points.length;
        stroke.points = stroke.points.filter(p => ((p.x - x)**2 + (p.y - y)**2) > eraseRadiusSquared);
        if (stroke.points.length < initialLength) somethingWasErased = true;
    });
    state.composition.strokes = state.composition.strokes.filter(stroke => stroke.points.length > 1);

    if (somethingWasErased) {
        redrawAll();
        saveState();
    }
}


// --- SELECTION, COPY, PASTE, DELETE HELPERS ---
function moveSelectedElements(dx, dy) {
    state.selectedElements.forEach(id => {
        const element = findElementById(id);
        if (element) {
            if (element.points) {
                element.points.forEach(p => {
                    p.x += dx;
                    p.y += dy;
                });
            } else {
                element.x += dx;
                element.y += dy;
                if (typeof element.endX !== 'undefined') {
                    element.endX += dx;
                    element.endY += dy;
                }
            }
        }
    });
}

function deleteSelectedElements() {
    if (state.selectedElements.length === 0) return;
    state.composition.strokes = state.composition.strokes.filter(s => !state.selectedElements.includes(s.id));
    state.composition.symbols = state.composition.symbols.filter(s => !state.selectedElements.includes(s.id));
    state.selectedElements = [];
    saveState();
    redrawAll();
}

function copySelectedElements() {
    if (state.selectedElements.length === 0) return;
    clipboard = state.selectedElements
        .map(id => findElementById(id))
        .filter(Boolean)
        .map(el => JSON.parse(JSON.stringify(el)));
}

function pasteElements() {
    if (clipboard.length === 0) return;
    const newSelection = [];
    const pasteOffset = 20;

    clipboard.forEach(element => {
        const newElement = JSON.parse(JSON.stringify(element));
        newElement.id = Date.now() + Math.random();

        if (newElement.points) {
            newElement.points.forEach(p => {
                p.x += pasteOffset;
                p.y += pasteOffset;
            });
            state.composition.strokes.push(newElement);
        } else {
            newElement.x += pasteOffset;
            newElement.y += pasteOffset;
            if (newElement.endX) newElement.endX += pasteOffset;
            if (newElement.endY) newElement.endY += pasteOffset;
            state.composition.symbols.push(newElement);
        }
        newSelection.push(newElement.id);
    });

    state.selectedElements = newSelection;
    saveState();
    redrawAll();
}

function findElementById(id) {
    return state.composition.strokes.find(s => s.id === id) || state.composition.symbols.find(s => s.id === id);
}

function getElementBoundingBox(element) {
    if (!element) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (element.points && element.points.length > 0) {
        element.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
    } else {
        const size = element.size || 10;
        if (element.type === 'glissando') {
            minX = Math.min(element.x, element.endX);
            minY = Math.min(element.y, element.endY);
            maxX = Math.max(element.x, element.endX);
            maxY = Math.max(element.y, element.endY);
        } else {
             minX = element.x - size / 2;
             minY = element.y - size / 2;
             maxX = element.x + size / 2;
             maxY = element.y + size / 2;
        }
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function drawMarquee() {
    if (!state.isSelecting || !state.selectionStart || !state.selectionEnd) return;
    const start = state.selectionStart;
    const end = state.selectionEnd;
    const selectionColor = getComputedStyle(d.documentElement).getPropertyValue('--selection-glow').trim();

    ctx.save();
    ctx.fillStyle = selectionColor.replace(/[^,]+(?=\))/, '0.2');
    ctx.strokeStyle = selectionColor;
    ctx.lineWidth = 1;
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.restore();
}

function drawSelectionIndicator(element) {
    const box = getElementBoundingBox(element);
    if (box) {
        ctx.save();
        ctx.strokeStyle = getComputedStyle(d.documentElement).getPropertyValue('--selection-glow').trim();
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(box.x - 5, box.y - 5, box.width + 10, box.height + 10);
        ctx.restore();
    }
}

function isPointNearLine(p, a, b, tolerance) {
    const L2 = (b.x - a.x)**2 + (b.y - a.y)**2;
    if (L2 === 0) return Math.sqrt((p.x - a.x)**2 + (p.y - a.y)**2) < tolerance;
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2;
    t = Math.max(0, Math.min(1, t));
    const dx = p.x - (a.x + t * (b.x - a.x));
    const dy = p.y - (a.y + t * (b.y - a.y));
    return (dx**2 + dy**2) < tolerance**2;
}

function getElementAtPos(pos) {
    const tolerance = 10;
    for (let i = state.composition.symbols.length - 1; i >= 0; i--) {
        const s = state.composition.symbols[i];
        const box = getElementBoundingBox(s);
        if (box && pos.x >= box.x - tolerance && pos.x <= box.x + box.width + tolerance && pos.y >= box.y - tolerance && pos.y <= box.y + box.height + tolerance) {
            return s;
        }
    }
    for (let i = state.composition.strokes.length - 1; i >= 0; i--) {
        const stroke = state.composition.strokes[i];
        const strokeTolerance = (stroke.lineWidth / 2) + tolerance;
        for (let j = 0; j < stroke.points.length - 1; j++) {
            if (isPointNearLine(pos, stroke.points[j], stroke.points[j+1], strokeTolerance)) {
                return stroke;
            }
        }
    }
    return null;
}

function doRectsIntersect(r1, r2) {
    if (!r1 || !r2) return false;
    const selX1 = Math.min(r1.x, r1.x + r1.width);
    const selX2 = Math.max(r1.x, r1.x + r1.width);
    const selY1 = Math.min(r1.y, r1.y + r1.height);
    const selY2 = Math.max(r1.y, r1.y + r1.height);

    const elX1 = r2.x;
    const elX2 = r2.x + r2.width;
    const elY1 = r2.y;
    const elY2 = r2.y + r2.height;

    return !(selX2 < elX1 || elX2 < selX1 || selY2 < elY1 || elY2 < selY1);
}

// --- PROJECT SAVE/LOAD/IMPORT ---
function saveProject() {
    try {
        const projectData = JSON.stringify(state.composition);
        const blob = new Blob([projectData], { type: 'application/json' });
        const link = d.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `meu-projeto-${Date.now()}.drawmus`;
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (e) {
        console.error("Erro ao salvar projeto:", e);
        alert("Não foi possível salvar o projeto.");
    }
}

function importProject(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const projectData = JSON.parse(e.target.result);
            if (projectData && Array.isArray(projectData.strokes) && Array.isArray(projectData.symbols)) {
                state.composition = projectData;
                state.selectedElements = [];
                redrawAll();
                saveState();
            } else {
                throw new Error("Formato de arquivo inválido.");
            }
        } catch (err) {
            console.error("Erro ao importar projeto:", err);
            alert("Erro ao ler o arquivo do projeto. Ele pode estar corrompido ou não ser um arquivo .drawmus válido.");
        } finally {
            event.target.value = null;
        }
    };
    reader.readAsText(file);
}

function loadAutoSavedProject() {
    const savedJson = localStorage.getItem(AUTOSAVE_KEY);
    if (savedJson) {
        try {
            const savedComposition = JSON.parse(savedJson);
            if (savedComposition && (savedComposition.strokes.length > 0 || savedComposition.symbols.length > 0)) {
                if (confirm("Encontramos um projeto salvo automaticamente. Deseja carregá-lo?")) {
                    state.composition = savedComposition;
                }
            }
        } catch (e) {
            console.error("Erro ao carregar projeto do localStorage:", e);
            localStorage.removeItem(AUTOSAVE_KEY);
        }
    }
}

// --- UNDO / REDO & HISTORY ---
function saveState(isInitial = false) {
    if (!isInitial) {
        state.history.length = state.historyIndex + 1;
    }
    const historyState = { ...state.composition };
    state.history.push(JSON.parse(JSON.stringify(historyState)));
    state.historyIndex++;
    updateUndoRedoButtons();
    updateExportButtonsState();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition));
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        state.selectedElements = [];
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition));
        redrawAll();
        updateUndoRedoButtons();
        updateExportButtonsState();
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        state.selectedElements = [];
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition));
        redrawAll();
        updateUndoRedoButtons();
        updateExportButtonsState();
    }
}

function updateUndoRedoButtons() {
    el.undoBtn.disabled = state.historyIndex <= 0;
    el.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

// --- AUDIO ENGINE ---
async function initAudio() {
    if (state.audioCtx && state.audioCtx.state !== 'closed') return;
    try {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        alert('Seu navegador não suporta a Web Audio API.');
    }
}

function togglePlayback() {
    if (!state.composition.strokes.length && !state.composition.symbols.length) return;
    state.isPlaying ? stopPlayback() : startPlayback();
}

function startPlayback() {
    initAudio().then(() => {
        if (!state.audioCtx) return;
        if (state.audioCtx.state === 'suspended') state.audioCtx.resume();

        state.isPlaying = true;
        updatePlaybackUI(true);

        const startX = state.playbackStartTime * PIXELS_PER_SECOND * state.zoomLevel;
        if (Math.abs(el.mainCanvasArea.scrollLeft - startX) > el.mainCanvasArea.offsetWidth) {
             el.mainCanvasArea.scrollLeft = startX - 100;
        }

        scheduleAllSounds(state.audioCtx);
        animatePlayhead();
    });
}

function stopPlayback() {
    state.isPlaying = false;

    state.sourceNodes.forEach(node => {
        try { node.stop(0); } catch(e) {}
    });
    state.sourceNodes = [];

    if (state.audioCtx) {
        state.audioCtx.close().then(() => state.audioCtx = null);
    }

    cancelAnimationFrame(state.animationFrameId);
    updatePlaybackUI(false);
}

function animatePlayhead() {
    if (!state.isPlaying || !state.audioCtx) return;

    const audioContextStartTime = state.audioCtx.currentTime;
    const canvasStartPosInSeconds = state.playbackStartTime;

    function frame() {
        if (!state.isPlaying || !state.audioCtx) return;

        const elapsedTime = state.audioCtx.currentTime - audioContextStartTime;
        const currentPosInSeconds = canvasStartPosInSeconds + elapsedTime;

        if (currentPosInSeconds >= MAX_DURATION_SECONDS) {
            stopPlayback();
            return;
        }

        state.playbackStartTime = currentPosInSeconds;
        updatePlayheadPosition();

        const currentXInPixels = state.playbackStartTime * PIXELS_PER_SECOND;
        const playheadRightEdge = currentXInPixels + 100;
        if (currentXInPixels > el.mainCanvasArea.scrollLeft + el.mainCanvasArea.clientWidth) {
            el.mainCanvasArea.scrollLeft = currentXInPixels - el.mainCanvasArea.clientWidth + 100;
        }

        state.animationFrameId = requestAnimationFrame(frame);
    }
    state.animationFrameId = requestAnimationFrame(frame);
}

function scheduleAllSounds(audioCtx) {
    const now = audioCtx.currentTime;
    state.sourceNodes = [];

    const mainOut = audioCtx.createGain();
    const reverbNode = audioCtx.createConvolver();
    reverbNode.buffer = createImpulseResponse(audioCtx, 1.5, 2);
    const reverbGain = audioCtx.createGain();
    reverbGain.gain.value = parseFloat(el.reverbSlider.value);
    mainOut.connect(reverbNode).connect(reverbGain).connect(audioCtx.destination);

    const dryGain = audioCtx.createGain();
    dryGain.gain.value = 1.0;
    mainOut.connect(dryGain).connect(audioCtx.destination);

    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;

        const xCoords = stroke.points.map(p => p.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);

        const strokeStartTime = minX / PIXELS_PER_SECOND;
        const strokeEndTime = maxX / PIXELS_PER_SECOND;

        if (strokeStartTime < state.playbackStartTime) {
            return;
        }

        let duration = strokeEndTime - strokeStartTime;
        if (duration <= 0) {
            duration = 0.1;
        }

        const timeToPlay = strokeStartTime - state.playbackStartTime;
        const scheduledStartTime = now + timeToPlay;

        const freqValues = new Float32Array(Math.ceil(duration * 100));
        let currentPointIndex = 0;
        for (let i = 0; i < freqValues.length; i++) {
            const timeInStroke = i / 100;
            const xPosInStroke = minX + timeInStroke * PIXELS_PER_SECOND;

            while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosInStroke) {
                currentPointIndex++;
            }
            const p1 = stroke.points[currentPointIndex];
            const p2 = stroke.points[currentPointIndex + 1];

            const segmentProgress = (p2.x - p1.x === 0) ? 0 : (xPosInStroke - p1.x) / (p2.x - p1.x);
            const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
            freqValues[i] = yToFrequency(interpolatedY);
        }

        const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
        const pan = xToPan(minX);

        createTone(audioCtx, {
            type: stroke.timbre,
            startTime: scheduledStartTime,
            endTime: scheduledStartTime + duration,
            freqValues: freqValues,
            vol: vol,
            pan: pan,
            x: minX
        }, mainOut);
    });

    state.composition.symbols.forEach(s => {
        const symbolStartTime = s.x / PIXELS_PER_SECOND;

        if (symbolStartTime < state.playbackStartTime) {
            return;
        }

        const scheduledTime = now + (symbolStartTime - state.playbackStartTime);
        const vol = 0.1 + (s.size / 50) * 0.4;
        const pan = xToPan(s.x);
        const freq = yToFrequency(s.y);

        switch (s.type) {
            case 'staccato': createTone(audioCtx, { type: 'triangle', startTime: scheduledTime, endTime: scheduledTime + 0.08, startFreq: freq, vol, pan, x: s.x }, mainOut); break;
            case 'percussion': createTone(audioCtx, { type: 'noise', startTime: scheduledTime, endTime: scheduledTime + 0.1, vol, pan, x: s.x }, mainOut); break;
            case 'arpeggio':
                [1, 5/4, 3/2, 2].forEach((interval, i) => {
                    createTone(audioCtx, { type: 'triangle', startTime: scheduledTime + i * 0.05, endTime: scheduledTime + i * 0.05 + 0.1, startFreq: freq * interval, vol: vol*0.8, pan, x: s.x }, mainOut);
                });
                break;
            case 'glissando':
                const glissEndTime = scheduledTime + ((s.endX - s.x) / PIXELS_PER_SECOND);
                if (glissEndTime > scheduledTime) {
                    createTone(audioCtx, { type: s.timbre, startTime: scheduledTime, endTime: glissEndTime, startFreq: yToFrequency(s.y), endFreq: yToFrequency(s.endY), vol, pan, x: s.x }, mainOut);
                }
                break;
            case 'tremolo':
                for (let t = 0; t < 0.5; t += 0.05) {
                    createTone(audioCtx, { type: 'sine', startTime: scheduledTime + t, endTime: scheduledTime + t + 0.1, startFreq: freq, vol: vol * 0.8, pan, x: s.x }, mainOut);
                }
                break;
            case 'granular':
                for (let i = 0; i < 20; i++) {
                     const t = scheduledTime + Math.random() * 0.5;
                     createTone(audioCtx, { type: 'sine', startTime: t, endTime: t + Math.random() * 0.1 + 0.05, startFreq: yToFrequency(s.y - s.size / 2 + Math.random() * s.size), vol: Math.random() * vol, pan: pan - 0.2 + Math.random() * 0.4, x: s.x }, mainOut);
                }
                break;
        }
    });
}

function createTone(audioCtx, opts, mainOut) {
    let osc;
    const duration = opts.endTime - opts.startTime;
    if (duration <= 0) return;

    if (opts.type === 'noise') {
        osc = audioCtx.createBufferSource();
        const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        osc.buffer = buffer;
        osc.loop = true;
    } else if (opts.type === 'fm') {
        const carrier = audioCtx.createOscillator(); carrier.type = 'sine';
        if(opts.freqValues) carrier.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
        else carrier.frequency.setValueAtTime(opts.startFreq, opts.startTime);

        const modulator = audioCtx.createOscillator(); modulator.type = 'square';
        modulator.frequency.value = (opts.startFreq || 200) * 1.5;
        const modGain = audioCtx.createGain(); modGain.gain.value = (opts.startFreq || 200) * 0.75;

        modulator.connect(modGain).connect(carrier.frequency);
        osc = audioCtx.createGain(); carrier.connect(osc);

        modulator.start(opts.startTime); modulator.stop(opts.endTime);
        carrier.start(opts.startTime); carrier.stop(opts.endTime);
        state.sourceNodes.push(modulator, carrier);
    } else {
        osc = audioCtx.createOscillator();
        osc.type = opts.type === 'pulse' ? 'square' : opts.type;
    }

    if (opts.freqValues && osc.frequency) {
        osc.frequency.setValueCurveAtTime(opts.freqValues, opts.startTime, duration);
    } else if (opts.startFreq && osc.frequency) {
        osc.frequency.setValueAtTime(opts.startFreq, opts.startTime);
        if (opts.endFreq) osc.frequency.linearRampToValueAtTime(opts.endFreq, opts.endTime);
    }

    const mainGain = audioCtx.createGain();
    mainGain.gain.setValueAtTime(0, opts.startTime);
    mainGain.gain.linearRampToValueAtTime(opts.vol, opts.startTime + 0.01);
    mainGain.gain.setValueAtTime(opts.vol, opts.endTime - 0.01);
    mainGain.gain.linearRampToValueAtTime(0, opts.endTime);

    const panner = audioCtx.createStereoPanner();
    panner.pan.setValueAtTime(opts.pan, opts.startTime);

    let lastNode = mainGain;
    const activeFilter = getActiveEffect(opts.x, 'filter');
    if (activeFilter) {
        const filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = (1 - (activeFilter.y / el.canvas.height)) * 5000 + 200;
        filterNode.Q.value = (activeFilter.size / 50) * 20;
        lastNode.connect(filterNode);
        lastNode = filterNode;
    }
    lastNode.connect(panner);

    const activeDelay = getActiveEffect(opts.x, 'delay');
    if (activeDelay) {
        const delayNode = audioCtx.createDelay(parseFloat(el.delayTimeSlider.max));
        delayNode.delayTime.value = parseFloat(el.delayTimeSlider.value);

        const feedbackNode = audioCtx.createGain();
        feedbackNode.gain.value = parseFloat(el.delayFeedbackSlider.value);

        panner.connect(delayNode).connect(feedbackNode).connect(delayNode);
        delayNode.connect(mainOut);
        panner.connect(mainOut);
    } else {
        panner.connect(mainOut);
    }

    osc.connect(mainGain);
    osc.start(opts.startTime);
    osc.stop(opts.endTime);
    state.sourceNodes.push(osc);
}

// --- UTILITY & UI FUNCTIONS ---
function updatePlaybackUI(isPlaying) {
    el.playIcon.classList.toggle('hidden', isPlaying);
    el.pauseIcon.classList.toggle('hidden', !isPlaying);
    el.playBtnText.textContent = isPlaying ? "Parar" : "Tocar";

    if (isPlaying) {
        el.playhead.classList.remove('hidden');
    } else {
        updatePlayheadPosition();
    }
}

function updateExportButtonsState() {
    const isEmpty = !state.composition.strokes.length && !state.composition.symbols.length;
    d.getElementById('exportBtn').disabled = isEmpty;
    el.exportJpgBtn.disabled = isEmpty;
    el.exportPdfBtn.disabled = isEmpty;
    el.exportWavBtn.disabled = isEmpty;
    el.saveProjectBtn.disabled = isEmpty;
}

function resetView() {
    if (state.isPlaying) {
        stopPlayback();
    }
    state.playbackStartTime = 0;
    el.mainCanvasArea.scrollLeft = 0;
    updatePlayheadPosition();
    redrawAll();
}

function yToFrequency(y) {
    const normalizedY = 1 - Math.max(0, Math.min(1, y / el.canvas.height));
    return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, normalizedY);
}

function yFromFrequency(freq) {
    const normalizedFreq = Math.log(freq / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
    return el.canvas.height * (1 - normalizedFreq);
}

function xToPan(x) { return (x / el.canvas.width) * 2 - 1; }

function getActiveEffect(x, type) {
    return state.composition.symbols.find(s => s.type === type && x >= s.x && x <= s.x + s.size * 2);
}

function createImpulseResponse(ac, duration = 1.5, decay = 2.0) {
    const rate = ac.sampleRate;
    const impulse = ac.createBuffer(2, rate * duration, rate);
    for (let i = 0; i < 2; i++) {
        const channel = impulse.getChannelData(i);
        for (let j = 0; j < channel.length; j++) {
            channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / channel.length, decay);
        }
    }
    return impulse;
}

function setActiveTool(toolName) {
    state.activeTool = toolName;
    state.glissandoStart = null;
    Object.values(el.tools).forEach(btn => btn?.classList.remove('active'));
    el.tools[toolName]?.classList.add('active');

    let cursor = 'crosshair';
    if (toolName === 'select') cursor = 'pointer';
    else if (toolName === 'hand') cursor = 'grab';
    else if (toolName === 'eraser') cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)" stroke="black" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="2,2"/></svg>') 12 12, auto`;
    else if (toolName === 'glissando') cursor = 'pointer';
    else if (['staccato', 'percussion', 'arpeggio', 'granular', 'tremolo', 'filter', 'delay'].includes(toolName)) cursor = 'copy';

    el.canvas.style.cursor = cursor;
}

function setActiveTimbre(timbreName) {
    state.activeTimbre = timbreName;
    Object.values(el.timbres).forEach(btn => btn?.classList.remove('active'));
    el.timbres[timbreName]?.classList.add('active');
}

function applyTheme(theme) {
    d.documentElement.setAttribute('data-theme', theme);
    el.themeSun.classList.toggle('hidden', theme === 'dark');
    el.themeMoon.classList.toggle('hidden', theme !== 'dark');
    localStorage.setItem('music-drawing-theme', theme);
    setTimeout(redrawAll, 50);
}

// --- Funções da Seleção de Exportação ---

// --- CORREÇÃO: Modificada para aceitar eventos de mouse e toque ---
function handleExportDrag(e) {
    if (!state.isDraggingStart && !state.isDraggingEnd) return;
    
    // Previne o comportamento padrão do toque, como rolagem da página
    if (e.touches) e.preventDefault();
    
    const rect = el.xRulerContainer.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPosOnRuler = clientX - rect.left;

    const time = ((el.mainCanvasArea.scrollLeft / state.zoomLevel) + (xPosOnRuler / state.zoomLevel)) / PIXELS_PER_SECOND;

    if (state.isDraggingStart) {
        state.exportStartTime = Math.max(0, Math.min(time, state.exportEndTime - 0.1));
    } else if (state.isDraggingEnd) {
        state.exportEndTime = Math.min(MAX_DURATION_SECONDS, Math.max(time, state.exportStartTime + 0.1));
    }

    updateExportSelectionVisuals();
}

function updateExportSelectionVisuals() {
    const scroll = el.mainCanvasArea.scrollLeft;
    const zoom = state.zoomLevel;

    const startHandlePos = (state.exportStartTime * PIXELS_PER_SECOND * zoom) - scroll;
    const endHandlePos = (state.exportEndTime * PIXELS_PER_SECOND * zoom) - scroll;

    el.exportStartHandle.style.left = `${startHandlePos}px`;
    el.exportEndHandle.style.left = `${endHandlePos}px`;

    const overlayStart = state.exportStartTime * PIXELS_PER_SECOND;
    const overlayEnd = state.exportEndTime * PIXELS_PER_SECOND;

    el.exportSelectionOverlay.style.left = `${overlayStart}px`;
    el.exportSelectionOverlay.style.width = `${overlayEnd - overlayStart}px`;
}

// --- EXPORT FUNCTIONS ---
function exportJpg() {
    try {
        const tempCanvas = d.createElement('canvas');
        tempCanvas.width = el.canvas.width;
        tempCanvas.height = el.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.fillStyle = getComputedStyle(d.documentElement).getPropertyValue('--bg-dark').trim();
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        tempCtx.drawImage(el.canvas, 0, 0);

        const link = d.createElement('a');
        link.href = tempCanvas.toDataURL('image/jpeg', 0.9);
        link.download = `music-drawing-${Date.now()}.jpg`;
        link.click();
    } catch (e) {
        console.error("Erro ao exportar JPG:", e);
        alert("Não foi possível exportar a imagem como JPG.");
    }
}
function exportPdf() {
    try {
        const tempCanvas = d.createElement('canvas');
        tempCanvas.width = el.canvas.width;
        tempCanvas.height = el.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = getComputedStyle(d.documentElement).getPropertyValue('--bg-dark').trim();
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(el.canvas, 0, 0);

        const imgData = tempCanvas.toDataURL('image/jpeg', 0.8);

        const orientation = tempCanvas.width > tempCanvas.height ? 'l' : 'p';
        const pdf = new jsPDF({
            orientation: orientation,
            unit: 'px',
            format: [tempCanvas.width, tempCanvas.height]
        });

        pdf.addImage(imgData, 'JPEG', 0, 0, tempCanvas.width, tempCanvas.height);
        pdf.save(`music-drawing-${Date.now()}.pdf`);

    } catch (e) {
        console.error("Erro ao exportar PDF:", e);
        alert("Não foi possível exportar como PDF.");
    }
}

async function exportWav() {
    const { exportStartTime, exportEndTime } = state;
    if (exportEndTime <= exportStartTime) {
        alert("A seleção de exportação é inválida. O tempo final deve ser maior que o inicial.");
        return;
    }

    el.loadingOverlay.classList.remove('hidden');

    const duration = exportEndTime - exportStartTime;
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 44100 * duration, 44100);

    const scheduleForExport = (audioCtx) => {
        const now = 0;

        const mainOut = audioCtx.createGain();
        mainOut.connect(audioCtx.destination);

        state.composition.strokes.forEach(stroke => {
            if (stroke.points.length < 2) return;

            const strokeStart = stroke.points[0].x / PIXELS_PER_SECOND;
            const strokeEnd = stroke.points[stroke.points.length - 1].x / PIXELS_PER_SECOND;

            if (strokeEnd < exportStartTime || strokeStart > exportEndTime) return;

            const scheduledStartTime = Math.max(0, strokeStart - exportStartTime);
            let strokeDuration = strokeEnd - strokeStart;
            if (strokeDuration <=0) strokeDuration = 0.1;

            const freqValues = new Float32Array(Math.ceil(strokeDuration * 100));
             let currentPointIndex = 0;
            for (let i = 0; i < freqValues.length; i++) {
                const timeInStroke = i / 100;
                const xPosInStroke = stroke.points[0].x + timeInStroke * PIXELS_PER_SECOND;

                while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosInStroke) {
                    currentPointIndex++;
                }
                const p1 = stroke.points[currentPointIndex];
                const p2 = stroke.points[currentPointIndex + 1];

                const segmentProgress = (p2.x - p1.x === 0) ? 0 : (xPosInStroke - p1.x) / (p2.x - p1.x);
                const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
                freqValues[i] = yToFrequency(interpolatedY);
            }

            const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
            const pan = xToPan(stroke.points[0].x);

            createTone(audioCtx, {
                type: stroke.timbre,
                startTime: now + scheduledStartTime,
                endTime: now + scheduledStartTime + strokeDuration,
                freqValues: freqValues,
                vol: vol,
                pan: pan,
                x: stroke.points[0].x
            }, mainOut);
        });

        state.composition.symbols.forEach(s => {
            const symbolTime = s.x / PIXELS_PER_SECOND;
            if (symbolTime < exportStartTime || symbolTime > exportEndTime) return;

            const scheduledTime = now + (symbolTime - exportStartTime);
            const vol = 0.1 + (s.size / 50) * 0.4;
            const pan = xToPan(s.x);
            const freq = yToFrequency(s.y);

            switch (s.type) {
                case 'staccato': createTone(offlineCtx, { type: 'triangle', startTime: scheduledTime, endTime: scheduledTime + 0.08, startFreq: freq, vol, pan, x: s.x }, mainOut); break;
                case 'percussion': createTone(offlineCtx, { type: 'noise', startTime: scheduledTime, endTime: scheduledTime + 0.1, vol, pan, x: s.x }, mainOut); break;
                case 'arpeggio':
                    [1, 5/4, 3/2, 2].forEach((interval, i) => {
                        createTone(offlineCtx, { type: 'triangle', startTime: scheduledTime + i * 0.05, endTime: scheduledTime + i * 0.05 + 0.1, startFreq: freq * interval, vol: vol*0.8, pan, x: s.x }, mainOut);
                    });
                    break;
                case 'glissando':
                    const glissEndTime = scheduledTime + ((s.endX - s.x) / PIXELS_PER_SECOND);
                    if (glissEndTime > scheduledTime) {
                        createTone(offlineCtx, { type: s.timbre, startTime: scheduledTime, endTime: glissEndTime, startFreq: yToFrequency(s.y), endFreq: yToFrequency(s.endY), vol, pan, x: s.x }, mainOut);
                    }
                    break;
                case 'tremolo':
                    for (let t = 0; t < 0.5; t += 0.05) {
                        createTone(offlineCtx, { type: 'sine', startTime: scheduledTime + t, endTime: scheduledTime + t + 0.1, startFreq: freq, vol: vol * 0.8, pan, x: s.x }, mainOut);
                    }
                    break;
                case 'granular':
                    for (let i = 0; i < 20; i++) {
                         const t = scheduledTime + Math.random() * 0.5;
                         createTone(offlineCtx, { type: 'sine', startTime: t, endTime: t + Math.random() * 0.1 + 0.05, startFreq: yToFrequency(s.y - s.size / 2 + Math.random() * s.size), vol: Math.random() * vol, pan: pan - 0.2 + Math.random() * 0.4, x: s.x }, mainOut);
                    }
                    break;
            }
        });
    };

    scheduleForExport(offlineCtx);

    try {
        const renderedBuffer = await offlineCtx.startRendering();
        const wav = bufferToWav(renderedBuffer);
        const blob = new Blob([new Uint8Array(wav)], { type: 'audio/wav' });

        const link = d.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `minha-musica-${Date.now()}.wav`;
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (e) {
        console.error('Erro ao renderizar o WAV:', e);
        alert('Ocorreu um erro ao exportar o áudio.');
    } finally {
        el.loadingOverlay.classList.add('hidden');
    }
}

function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return bufferArr;

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}

function simplify(points, tolerance) {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > tolerance) {
        const recResults1 = simplify(points.slice(0, index + 1), tolerance);
        const recResults2 = simplify(points.slice(index), tolerance);

        return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
    } else {
        return [points[0], points[end]];
    }
}

function perpendicularDistance(point, lineStart, lineEnd) {
    let dx = lineEnd.x - lineStart.x;
    let dy = lineEnd.y - lineStart.y;

    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) {
        dx /= mag;
        dy /= mag;
    }

    const pvx = point.x - lineStart.x;
    const pvy = point.y - lineStart.y;

    const pvdot = dx * pvx + dy * pvy;

    const ax = pvx - pvdot * dx;
    const ay = pvy - pvdot * dy;

    return Math.sqrt(ax * ax + ay * ay);
}


// --- STARTUP ---
d.addEventListener('DOMContentLoaded', () => {
    const pcModeBtn = d.getElementById('pc-mode-btn');
    const mobileModeBtn = d.getElementById('mobile-mode-btn');

    if (pcModeBtn && mobileModeBtn) {
        pcModeBtn.addEventListener('click', () => initApp('pc'));
        mobileModeBtn.addEventListener('click', () => initApp('mobile'));
    }

    const selectionContainer = d.getElementById('selection-container');
    const backgroundAudio = d.getElementById('background-audio');

    if (selectionContainer && backgroundAudio) {
        const startAudioOnClick = () => {
            if (backgroundAudio.paused) {
                backgroundAudio.play().catch(error => {
                    console.error("A reprodução do áudio falhou mesmo após o clique:", error);
                });
            }
        };
        selectionContainer.addEventListener('click', startAudioOnClick, { once: true });
    }

    const appWrapper = d.getElementById('app-wrapper');
    if(selectionContainer) selectionContainer.classList.remove('hidden');
    if(appWrapper) appWrapper.classList.add('hidden');
});