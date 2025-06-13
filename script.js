// app/js/main.js - Lógica Unificada e Funcional
const d = document;
const { jsPDF } = window.jspdf;

// --- CONSTANTS ---
const MAX_DURATION_SECONDS = 600; // 10 minutes
const PIXELS_PER_SECOND = 100;
const FREQ_MIN = 100;
const FREQ_MAX = 2000;
const ERASE_RADIUS = 20;
const AUTOSAVE_KEY = 'music-drawing-autosave';

// --- DOM ELEMENTS ---
const el = {
    playBtn: d.getElementById('playBtn'), playIcon: d.getElementById('playIcon'), pauseIcon: d.getElementById('pauseIcon'), playBtnText: d.querySelector('#playBtn span'),
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
    musdrImporter: d.getElementById('musdrImporter'),

    exportJpgBtn: d.getElementById('exportJpgBtn'), exportPdfBtn: d.getElementById('exportPdfBtn'), exportWavBtn: d.getElementById('exportWavBtn'),
    undoBtn: d.getElementById('undoBtn'), redoBtn: d.getElementById('redoBtn'),
    
    canvas: d.getElementById('drawingCanvas'),
    canvasContainer: d.getElementById('canvas-container'),
    mainCanvasArea: d.getElementById('main-canvas-area'),
    yRulerCanvas: d.getElementById('y-ruler-canvas'),
    xRulerCanvas: d.getElementById('x-ruler-canvas'),
    xRulerContainer: d.getElementById('x-ruler-container'),
    yRulerContainer: d.getElementById('y-ruler-container'),

    tools: { pencil: d.getElementById('pencil'), eraser: d.getElementById('eraser'), hand: d.getElementById('hand'), glissando: d.getElementById('glissando'), staccato: d.getElementById('staccato'), percussion: d.getElementById('percussion'), arpeggio: d.getElementById('arpeggio'), granular: d.getElementById('granular'), tremolo: d.getElementById('tremolo'), filter: d.getElementById('filter'), delay: d.getElementById('delay') },
    timbres: { sine: d.getElementById('sine'), square: d.getElementById('square'), sawtooth: d.getElementById('sawtooth'), triangle: d.getElementById('triangle'), fm: d.getElementById('fm'), pulse: d.getElementById('pulse') }
};

const ctx = el.canvas.getContext('2d');
const yRulerCtx = el.yRulerCanvas.getContext('2d');
const xRulerCtx = el.xRulerCanvas.getContext('2d');

// --- STATE MANAGEMENT ---
let state = {
    isDrawing: false,
    activeTool: 'pencil',
    activeTimbre: 'sine',
    lastPos: { x: 0, y: 0 },
    glissandoStart: null,
    isPlaying: false,
    animationFrameId: null,
    audioCtx: null,
    sourceNodes: [],
    composition: { strokes: [], symbols: [] },
    history: [],
    historyIndex: -1
};

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
        setupMobileToolbar();
    }
    
    loadAutoSavedProject(); // Check for autosaved project
    setupEventListeners();
    applyTheme(localStorage.getItem('music-drawing-theme') || 'dark');
    setActiveTool('pencil');
    setActiveTimbre('sine');
    
    setTimeout(() => {
        resizeAndRedraw();
        if (state.history.length === 0) {
            saveState(true); // Save initial empty state
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
    ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
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
    drawRulers();
}

function drawRulers() {
    const textColor = getComputedStyle(d.documentElement).getPropertyValue('--text-dark').trim();
    const rulerFont = '9px Inter';
    
    yRulerCtx.clearRect(0, 0, el.yRulerCanvas.width, el.yRulerCanvas.height);
    yRulerCtx.fillStyle = textColor;
    yRulerCtx.font = rulerFont;
    yRulerCtx.textAlign = 'right';
    yRulerCtx.textBaseline = 'middle';
    
    for(let freq = FREQ_MIN; freq <= FREQ_MAX; freq += 100) {
        if (freq % 200 !== 0 && freq !== FREQ_MIN) continue;
        const yPos = yFromFrequency(freq);
        if (yPos > 0 && yPos < el.canvas.height) {
            yRulerCtx.fillRect(el.yRulerCanvas.width - 10, yPos, 10, 1);
            yRulerCtx.fillText(`${Math.round(freq)}`, el.yRulerCanvas.width - 15, yPos);
        }
    }

    xRulerCtx.clearRect(0, 0, el.xRulerCanvas.width, el.xRulerCanvas.height);
    xRulerCtx.fillStyle = textColor;
    xRulerCtx.font = rulerFont;
    xRulerCtx.textAlign = 'center';
    xRulerCtx.textBaseline = 'top';
    
    const interval = window.innerWidth < 768 ? 10 : 5; // Wider spacing on mobile
    for (let sec = 0; sec <= MAX_DURATION_SECONDS; sec++) {
        const xPos = sec * PIXELS_PER_SECOND;
        if (sec % interval === 0) {
            // Alterado para desenhar uma LINHA de 1px de largura para a marcação principal
            xRulerCtx.fillRect(xPos, 0, 1, 2);
            xRulerCtx.fillText(`${sec}seg.`, xPos, 8);
        } else if (sec % 1 === 0) {
            // Alterado para desenhar uma LINHA de 1px para as marcações secundárias
            xRulerCtx.fillRect(xPos, 0, 1, 5);
        }
    }
}

// --- EVENT HANDLING ---
function setupEventListeners() {
    window.addEventListener('resize', resizeAndRedraw);
    el.mainCanvasArea.addEventListener('scroll', syncScroll);

    const canvasEvents = {
        'mousedown': startAction, 'mouseup': stopAction, 'mouseleave': stopAction, 'mousemove': performAction,
        'touchstart': startAction, 'touchend': stopAction, 'touchcancel': stopAction, 'touchmove': performAction
    };
    Object.entries(canvasEvents).forEach(([event, listener]) => {
        el.canvas.addEventListener(event, listener, { passive: false });
    });
    
    el.playBtn.addEventListener('click', togglePlayback);
    el.clearBtn.addEventListener('click', handleClear);
    el.themeToggle.addEventListener('click', () => applyTheme(d.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    
    Object.keys(el.tools).forEach(key => el.tools[key]?.addEventListener('click', () => setActiveTool(key)));
    Object.keys(el.timbres).forEach(key => el.timbres[key]?.addEventListener('click', () => setActiveTimbre(key)));
    
    el.saveProjectBtn.addEventListener('click', saveProject);
    el.importProjectBtn.addEventListener('click', () => el.musdrImporter.click());
    el.musdrImporter.addEventListener('change', importProject);

    el.exportJpgBtn.addEventListener('click', exportJpg);
    el.exportPdfBtn.addEventListener('click', exportPdf);
    el.exportWavBtn.addEventListener('click', exportWav);

    el.undoBtn.addEventListener('click', undo);
    el.redoBtn.addEventListener('click', redo);
    window.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') { e.preventDefault(); undo(); }
            if (e.key === 'y') { e.preventDefault(); redo(); }
            if (e.key === 's') { e.preventDefault(); saveProject(); }
        }
        if (e.key === ' ' && e.target === d.body) { e.preventDefault(); togglePlayback(); }
    });
}

function setupMobileToolbar() {
    const tabs = d.querySelectorAll('.toolbar-tab');
    const panels = d.querySelectorAll('.toolbar-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            // Activate clicked tab and its corresponding panel
            tab.classList.add('active');
            const targetPanelId = tab.dataset.tab;
            const targetPanel = d.querySelector(`.toolbar-panel[data-panel="${targetPanelId}"]`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

function getEventPos(e) {
    const rect = el.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function startAction(e) {
    e.preventDefault();
    initAudio();
    
    const pos = getEventPos(e);
    
    switch (state.activeTool) {
        case 'pencil':
            state.isDrawing = true;
            state.lastPos = pos;
            const newStroke = { id: Date.now(), points: [pos], color: el.colorPicker.value, lineWidth: el.lineWidth.value, timbre: state.activeTimbre };
            state.composition.strokes.push(newStroke);
            break;
        case 'eraser':
            state.isDrawing = true;
            eraseAt(pos.x, pos.y);
            break;
        case 'hand':
            state.isDrawing = true;
            state.lastPos = pos;
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
    if (state.isDrawing) {
        e.preventDefault();
        state.isDrawing = false;
        
        if (state.activeTool === 'hand') {
            el.canvas.style.cursor = 'grab';
            return;
        }

        ctx.beginPath();
        const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
        if (currentStroke && currentStroke.points.length > 200) {
           currentStroke.points = simplify(currentStroke.points, 0.5, true);
        }
        saveState();
    }
}

function performAction(e) {
    if (!state.isDrawing) return;
    e.preventDefault();
    const pos = getEventPos(e);

    if (state.activeTool === 'hand') {
        const dx = pos.x - state.lastPos.x;
        const dy = pos.y - state.lastPos.y;
        el.mainCanvasArea.scrollLeft -= dx;
        el.mainCanvasArea.scrollTop -= dy;
        state.lastPos = pos;
        return;
    }

    if (state.activeTool === 'pencil') {
        const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
        if (!currentStroke) return;
        currentStroke.points.push(pos);
        
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
}

function syncScroll(e) {
    el.xRulerContainer.scrollLeft = e.target.scrollLeft;
    el.yRulerContainer.scrollTop = e.target.scrollTop;
}

// --- DRAWING & COMPOSITION ---
function handleClear() {
    if (confirm("Tem certeza de que deseja limpar toda a pauta? Esta ação não pode ser desfeita.")) {
        state.composition = { strokes: [], symbols: [] };
        state.history = [];
        state.historyIndex = -1;
        saveState(true); // Save the new empty state
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

// --- PROJECT SAVE/LOAD/IMPORT ---
function saveProject() {
    try {
        const projectData = JSON.stringify(state.composition);
        const blob = new Blob([projectData], { type: 'application/json' });
        const link = d.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `meu-projeto-${Date.now()}.musdr`;
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
            // Basic validation
            if (projectData && Array.isArray(projectData.strokes) && Array.isArray(projectData.symbols)) {
                state.composition = projectData;
                redrawAll();
                saveState(); // Add imported state to history
            } else {
                throw new Error("Formato de arquivo inválido.");
            }
        } catch (err) {
            console.error("Erro ao importar projeto:", err);
            alert("Erro ao ler o arquivo do projeto. Ele pode estar corrompido ou não ser um arquivo .musdr válido.");
        } finally {
            // Reset input to allow importing the same file again
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
    state.history.push(JSON.parse(JSON.stringify(state.composition)));
    state.historyIndex++;
    updateUndoRedoButtons();
    updateExportButtonsState();
    // Auto-save to localStorage
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition));
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition)); // Update autosave on undo
        redrawAll();
        updateUndoRedoButtons();
        updateExportButtonsState();
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.composition)); // Update autosave on redo
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
    
    const startTime = state.audioCtx.currentTime;
    const startScroll = el.mainCanvasArea.scrollLeft;
    let maxScroll = el.canvas.width - el.mainCanvasArea.clientWidth;

    function frame() {
        if (!state.isPlaying || !state.audioCtx) return;
        
        const elapsedTime = state.audioCtx.currentTime - startTime;
        const currentX = startScroll + (elapsedTime * PIXELS_PER_SECOND);
        
        if (currentX >= el.canvas.width) {
            stopPlayback();
            return;
        }
        
        el.playhead.style.transform = `translateX(${currentX}px)`;
        
        // Auto-scroll
        const playheadRightEdge = currentX + 100; // Look ahead
        if(playheadRightEdge > el.mainCanvasArea.scrollLeft + el.mainCanvasArea.clientWidth) {
            el.mainCanvasArea.scrollLeft = Math.min(maxScroll, playheadRightEdge - el.mainCanvasArea.clientWidth);
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
        
        const startTime = now + stroke.points[0].x / PIXELS_PER_SECOND;
        const endTime = now + stroke.points[stroke.points.length - 1].x / PIXELS_PER_SECOND;
        const duration = endTime - startTime;
        if (duration <= 0) return;

        const freqValues = new Float32Array(Math.ceil(duration * 100));
        let currentPointIndex = 0;
        for (let i = 0; i < freqValues.length; i++) {
            const timeInStroke = i / 100;
            const xPosInStroke = stroke.points[0].x + timeInStroke * PIXELS_PER_SECOND;
            
            while(currentPointIndex < stroke.points.length - 2 && stroke.points[currentPointIndex + 1].x < xPosInStroke) {
                currentPointIndex++;
            }
            const p1 = stroke.points[currentPointIndex];
            const p2 = stroke.points[currentPointIndex + 1];
            
            const segmentProgress = (xPosInStroke - p1.x) / (p2.x - p1.x || 1);
            const interpolatedY = p1.y + (p2.y - p1.y) * segmentProgress;
            freqValues[i] = yToFrequency(interpolatedY);
        }

        const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;
        const pan = xToPan(stroke.points[0].x);

        createTone(audioCtx, {
            type: stroke.timbre,
            startTime: startTime,
            endTime: endTime,
            freqValues: freqValues,
            vol: vol,
            pan: pan,
            x: stroke.points[0].x
        }, mainOut);
    });

    state.composition.symbols.forEach(s => {
        const startTime = now + (s.x / PIXELS_PER_SECOND);
        const vol = 0.1 + (s.size / 50) * 0.4;
        const pan = xToPan(s.x);
        const freq = yToFrequency(s.y);

        switch (s.type) {
            case 'staccato': createTone(audioCtx, { type: 'triangle', startTime, endTime: startTime + 0.08, startFreq: freq, vol, pan, x: s.x }, mainOut); break;
            case 'percussion': createTone(audioCtx, { type: 'noise', startTime, endTime: startTime + 0.1, vol, pan, x: s.x }, mainOut); break;
            case 'arpeggio':
                [1, 5/4, 3/2, 2].forEach((interval, i) => {
                    createTone(audioCtx, { type: 'triangle', startTime: startTime + i * 0.05, endTime: startTime + i * 0.05 + 0.1, startFreq: freq * interval, vol: vol*0.8, pan, x: s.x }, mainOut);
                });
                break;
            case 'glissando':
                const glissEndTime = now + (s.endX / PIXELS_PER_SECOND);
                if (glissEndTime > startTime) {
                    createTone(audioCtx, { type: s.timbre, startTime, endTime: glissEndTime, startFreq: yToFrequency(s.y), endFreq: yToFrequency(s.endY), vol, pan, x: s.x }, mainOut);
                }
                break;
            case 'tremolo':
                for (let t = startTime; t < startTime + 0.5; t += 0.05) {
                    createTone(audioCtx, { type: 'sine', startTime: t, endTime: t + 0.1, startFreq: freq, vol: vol * 0.8, pan, x: s.x }, mainOut);
                }
                break;
            case 'granular':
                for (let i = 0; i < 20; i++) {
                     const t = startTime + Math.random() * 0.5;
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
    el.playhead.classList.toggle('hidden', !isPlaying);
    el.playIcon.classList.toggle('hidden', isPlaying);
    el.pauseIcon.classList.toggle('hidden', !isPlaying);
    el.playBtnText.textContent = isPlaying ? "Parar" : "Tocar";
    if (isPlaying) {
         el.playhead.style.transform = `translateX(${el.mainCanvasArea.scrollLeft}px)`;
    } else {
         el.mainCanvasArea.scrollLeft = 0;
         el.playhead.style.transform = `translateX(0px)`;
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
    if (['staccato', 'percussion', 'arpeggio', 'granular', 'tremolo', 'filter', 'delay'].includes(toolName)) cursor = 'copy';
    if (toolName === 'glissando') cursor = 'pointer';
    if (toolName === 'hand') cursor = 'grab';
    if (toolName === 'eraser') cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)" stroke="black" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="2,2"/></svg>') 12 12, auto`;
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

// --- EXPORT FUNCTIONS ---
function exportJpg() { /* ... unchanged ... */ }
function exportPdf() { /* ... unchanged ... */ }
async function exportWav() { /* ... unchanged ... */ }
function bufferToWav(buffer) { /* ... unchanged ... */ }
function simplify(points, tolerance, highestQuality) { /* ... unchanged ... */ }

// --- STARTUP ---
d.addEventListener('DOMContentLoaded', () => {
    const pcModeBtn = d.getElementById('pc-mode-btn');
    const mobileModeBtn = d.getElementById('mobile-mode-btn');

    if (pcModeBtn && mobileModeBtn) {
        pcModeBtn.addEventListener('click', () => initApp('pc'));
        mobileModeBtn.addEventListener('click', () => initApp('mobile'));
    }
     const backgroundAudio = d.getElementById('background-audio');
     if (backgroundAudio) {
        // Tenta tocar o áudio. Pode ser bloqueado pelas políticas de autoplay do navegador.
        backgroundAudio.play().catch(error => {
            console.log("A reprodução automática foi bloqueada. O áudio começará no primeiro clique do usuário.", error);
            // Se for bloqueado, adiciona um ouvinte para o primeiro clique em qualquer lugar da tela
            d.body.addEventListener('click', () => {
                backgroundAudio.play();
            }, { once: true }); // 'once: true' garante que isso aconteça apenas uma vez
        });
    }
    const selectionContainer = d.getElementById('selection-container');
    const appWrapper = d.getElementById('app-wrapper');
    if(selectionContainer) selectionContainer.classList.remove('hidden');
    if(appWrapper) appWrapper.classList.add('hidden');
});