// app/js/main.js - Lógica Unificada e Funcional
const d = document;
const { jsPDF } = window.jspdf;

// --- CONSTANTS ---
const MAX_DURATION_SECONDS = 600; // 10 minutes
const PIXELS_PER_SECOND = 40;
const FREQ_MIN = 100;
const FREQ_MAX = 2000;
const ERASE_RADIUS = 20;

// --- DOM ELEMENTS ---
// Mapeamento dos elementos do HTML moderno
const el = {
    playBtn: d.getElementById('playBtn'), playIcon: d.getElementById('playIcon'), pauseIcon: d.getElementById('pauseIcon'), playBtnText: d.querySelector('#playBtn span'),
    playhead: d.getElementById('playhead'), colorPicker: d.getElementById('colorPicker'), lineWidth: d.getElementById('lineWidth'),
    clearBtn: d.getElementById('clearBtn'), reverbSlider: d.getElementById('reverb'), themeToggle: d.getElementById('theme-toggle'),
    themeSun: d.getElementById('theme-icon-sun'), themeMoon: d.getElementById('theme-icon-moon'),
    loadingOverlay: d.getElementById('loading-overlay'),
    exportJpgBtn: d.getElementById('exportJpgBtn'), exportPdfBtn: d.getElementById('exportPdfBtn'), exportWavBtn: d.getElementById('exportWavBtn'),
    undoBtn: d.getElementById('undoBtn'), redoBtn: d.getElementById('redoBtn'),
    
    canvas: d.getElementById('drawingCanvas'),
    canvasContainer: d.getElementById('canvas-container'),
    mainCanvasArea: d.getElementById('main-canvas-area'),
    yRulerCanvas: d.getElementById('y-ruler-canvas'),
    xRulerCanvas: d.getElementById('x-ruler-canvas'),
    xRulerContainer: d.getElementById('x-ruler-container'),
    yRulerContainer: d.getElementById('y-ruler-container'),

    tools: { pencil: d.getElementById('pencil'), eraser: d.getElementById('eraser'), glissando: d.getElementById('glissando'), staccato: d.getElementById('staccato'), percussion: d.getElementById('percussion'), arpeggio: d.getElementById('arpeggio'), granular: d.getElementById('granular'), tremolo: d.getElementById('tremolo'), filter: d.getElementById('filter') },
    timbres: { sine: d.getElementById('sine'), square: d.getElementById('square'), sawtooth: d.getElementById('sawtooth'), triangle: d.getElementById('triangle'), fm: d.getElementById('fm'), noise: d.getElementById('noise') }
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
    const selectionContainer = d.getElementById('selection-container');
    const appWrapper = d.getElementById('app-wrapper');

    if (selectionContainer) selectionContainer.classList.add('hidden');
    if (appWrapper) appWrapper.classList.remove('hidden');
    
    if (mode === 'mobile') {
        d.body.classList.add('mobile-mode');
    }
    
    setupEventListeners();
    applyTheme(localStorage.getItem('music-drawing-theme') || 'dark');
    setActiveTool('pencil');
    setActiveTimbre('sine');
    
    // Atraso para garantir que o layout CSS foi aplicado antes de medir
    setTimeout(() => {
        resizeAndRedraw();
        saveState();
    }, 100);
}

function resizeAndRedraw() {
    const canvasWidth = MAX_DURATION_SECONDS * PIXELS_PER_SECOND;
    const canvasHeight = el.mainCanvasArea.offsetHeight;
    
    if(canvasHeight <= 0) {
        console.warn("Área do Canvas com altura 0. Tentando redimensionar novamente em 100ms.");
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
    const rulerFont = '10px Inter';
    
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
    
    for (let sec = 0; sec <= MAX_DURATION_SECONDS; sec++) {
        const xPos = sec * PIXELS_PER_SECOND;
        if (sec % 5 === 0) {
            xRulerCtx.fillRect(xPos, 0, 1, 10);
            xRulerCtx.fillText(`${sec}s`, xPos, 12);
        } else {
            xRulerCtx.fillRect(xPos, 0, 1, 5);
        }
    }
}

// --- EVENT HANDLING ---
function setupEventListeners() {
    window.addEventListener('resize', resizeAndRedraw);
    el.mainCanvasArea.addEventListener('scroll', syncScroll);

    const canvasEvents = {
        'mousedown': startAction, 'mouseup': stopAction, 'mouseout': stopAction, 'mousemove': performAction,
        'touchstart': startAction, 'touchend': stopAction, 'touchmove': performAction
    };
    Object.entries(canvasEvents).forEach(([event, listener]) => {
        el.canvas.addEventListener(event, listener, { passive: false });
    });
    
    el.playBtn.addEventListener('click', togglePlayback);
    el.clearBtn.addEventListener('click', handleClear);
    el.themeToggle.addEventListener('click', () => applyTheme(d.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    
    Object.keys(el.tools).forEach(key => el.tools[key]?.addEventListener('click', () => setActiveTool(key)));
    Object.keys(el.timbres).forEach(key => el.timbres[key]?.addEventListener('click', () => setActiveTimbre(key)));
    
    el.exportJpgBtn.addEventListener('click', exportJpg);
    el.exportPdfBtn.addEventListener('click', exportPdf);
    el.exportWavBtn.addEventListener('click', exportWav);

    el.undoBtn.addEventListener('click', undo);
    el.redoBtn.addEventListener('click', redo);
    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
        if (e.key === ' ') { e.preventDefault(); togglePlayback(); }
    });
}

function getMousePos(e) {
    const rect = el.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function startAction(e) {
    e.preventDefault();
    initAudio();
    
    const pos = getMousePos(e);
    
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
    e.preventDefault();
    if (state.isDrawing) {
        state.isDrawing = false;
        ctx.beginPath();
        saveState();
    }
}

function performAction(e) {
    if (!state.isDrawing) return;
    e.preventDefault();
    const pos = getMousePos(e);

    if (state.activeTool === 'pencil') {
        const currentStroke = state.composition.strokes[state.composition.strokes.length - 1];
        currentStroke.points.push(pos);
        ctx.beginPath();
        ctx.moveTo(state.lastPos.x, state.lastPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = currentStroke.color;
        ctx.lineWidth = currentStroke.lineWidth;
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
    if (confirm("Tem certeza de que deseja limpar toda a pauta?")) {
        state.composition = { strokes: [], symbols: [] };
        redrawAll();
        saveState();
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
        case 'filter': ctx.globalAlpha = 0.2; ctx.fillStyle = s.color; ctx.fillRect(s.x, 0, size * 2, el.canvas.height); ctx.globalAlpha = 1.0; ctx.beginPath(); ctx.moveTo(s.x, s.y - size/2); ctx.lineTo(s.x, s.y + size/2); ctx.lineTo(s.x + 10, s.y); ctx.closePath(); ctx.fillStyle = s.color; ctx.fill(); break;
    }
    ctx.restore();
}

function eraseAt(x, y) {
    let somethingWasErased = false;
    const eraseRadiusSquared = ERASE_RADIUS * ERASE_RADIUS;

    state.composition.symbols = state.composition.symbols.filter(s => {
        const distSq = (s.x - x)**2 + (s.y - y)**2;
        return distSq > eraseRadiusSquared;
    });
    if (state.composition.symbols.length < state.composition.symbols.length) somethingWasErased = true;
    
    state.composition.strokes.forEach(stroke => {
        const initialLength = stroke.points.length;
        stroke.points = stroke.points.filter(p => ((p.x - x)**2 + (p.y - y)**2) > eraseRadiusSquared);
        if (stroke.points.length < initialLength) somethingWasErased = true;
    });
    state.composition.strokes = state.composition.strokes.filter(stroke => stroke.points.length > 1);

    if (somethingWasErased) redrawAll();
}

// --- UNDO / REDO ---
function saveState() {
    state.history.length = state.historyIndex + 1;
    state.history.push(JSON.parse(JSON.stringify(state.composition)));
    state.historyIndex++;
    updateUndoRedoButtons();
    updateExportButtonsState();
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
        redrawAll();
        updateUndoRedoButtons();
        updateExportButtonsState();
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        state.composition = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
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
    if (!state.isPlaying) return;
    
    const startTime = state.audioCtx.currentTime;
    const startX = el.mainCanvasArea.scrollLeft;
    
    function frame() {
        if (!state.isPlaying) return;
        const elapsedTime = state.audioCtx.currentTime - startTime;
        const currentX = startX + (elapsedTime * PIXELS_PER_SECOND);
        
        if (currentX >= el.canvas.width) {
            stopPlayback();
            return;
        }
        
        el.playhead.style.transform = `translateX(${currentX}px)`;
        state.animationFrameId = requestAnimationFrame(frame);
    }
    state.animationFrameId = requestAnimationFrame(frame);
}

function scheduleAllSounds(audioCtx) {
    const now = audioCtx.currentTime;
    state.sourceNodes = [];
    
    const reverbNode = audioCtx.createConvolver();
    reverbNode.buffer = createImpulseResponse(audioCtx);
    const reverbGain = audioCtx.createGain();
    reverbGain.gain.value = parseFloat(el.reverbSlider.value);
    reverbNode.connect(reverbGain).connect(audioCtx.destination);
    
    const mainOut = audioCtx.createGain();
    mainOut.connect(audioCtx.destination);
    mainOut.connect(reverbNode);
    
    state.composition.strokes.forEach(stroke => {
        for (let i = 0; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i];
            const p2 = stroke.points[i+1];
            const startTime = p1.x / PIXELS_PER_SECOND;
            const endTime = p2.x / PIXELS_PER_SECOND;
            if (endTime <= startTime) continue;
            
            createTone(audioCtx, {
                type: stroke.timbre,
                startTime: now + startTime,
                endTime: now + endTime,
                startFreq: yToFrequency(p1.y),
                endFreq: yToFrequency(p2.y),
                vol: 0.1 + (stroke.lineWidth / 50) * 0.4,
                pan: xToPan(p1.x)
            }, mainOut);
        }
    });

    state.composition.symbols.forEach(s => {
        const startTime = now + (s.x / PIXELS_PER_SECOND);
        const vol = 0.1 + (s.size / 50) * 0.4;
        const pan = xToPan(s.x);
        const freq = yToFrequency(s.y);
        const filterParams = getActiveFilterParams(s.x);

        switch (s.type) {
            case 'staccato': createTone(audioCtx, { type: 'triangle', startTime, endTime: startTime + 0.08, startFreq: freq, vol, pan, filterParams }, mainOut); break;
            case 'percussion': createTone(audioCtx, { type: 'noise', startTime, endTime: startTime + 0.1, vol, pan, filterParams }, mainOut); break;
            case 'arpeggio':
                [1, 5/4, 3/2, 2].forEach((interval, i) => {
                    createTone(audioCtx, { type: 'triangle', startTime: startTime + i * 0.05, endTime: startTime + i * 0.05 + 0.1, startFreq: freq * interval, vol, pan, filterParams }, mainOut);
                });
                break;
            case 'glissando':
                const glissEndTime = now + (s.endX / PIXELS_PER_SECOND);
                if (glissEndTime > startTime) {
                    createTone(audioCtx, { type: s.timbre, startTime, endTime: glissEndTime, startFreq: yToFrequency(s.y), endFreq: yToFrequency(s.endY), vol, pan, filterParams }, mainOut);
                }
                break;
            case 'tremolo':
                const tremoloEndTime = now + ((s.x + s.size * 2) / PIXELS_PER_SECOND);
                for (let t = startTime; t < tremoloEndTime; t += Math.max(0.02, (200 - s.size * 3) / 1000)) {
                    createTone(audioCtx, { type: 'sine', startTime: t, endTime: t + 0.1, startFreq: freq, vol: vol * 0.8, pan, filterParams }, mainOut);
                }
                break;
            case 'granular':
                const granularEndTime = now + ((s.x + s.size * 2) / PIXELS_PER_SECOND);
                for (let t = startTime; t < granularEndTime; t += 0.05) {
                    if (Math.random() < 0.5) {
                        createTone(audioCtx, { type: 'sine', startTime: t, endTime: t + Math.random() * 0.1 + 0.05, startFreq: yToFrequency(s.y - s.size / 2 + Math.random() * s.size), vol: Math.random() * vol, pan, filterParams }, mainOut);
                    }
                }
                break;
        }
    });
}

function createTone(audioCtx, opts, mainOut) {
    let osc, mainGain;
    const duration = opts.endTime - opts.startTime;
    if (duration <= 0) return;

    if (opts.type === 'noise') {
        osc = audioCtx.createBufferSource();
        const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) output[i] = Math.random() * 2 - 1;
        osc.buffer = buffer;
    } else if (opts.type === 'fm') {
        const carrier = audioCtx.createOscillator(); carrier.type = 'sine';
        carrier.frequency.setValueAtTime(opts.startFreq, opts.startTime);
        if (opts.endFreq) carrier.frequency.linearRampToValueAtTime(opts.endFreq, opts.endTime);
        const modulator = audioCtx.createOscillator(); modulator.type = 'square';
        modulator.frequency.setValueAtTime(opts.startFreq * 1.5, opts.startTime);
        const modGain = audioCtx.createGain(); modGain.gain.setValueAtTime(opts.startFreq * 0.75, opts.startTime);
        modulator.connect(modGain).connect(carrier.frequency);
        osc = audioCtx.createGain(); carrier.connect(osc);
        modulator.start(opts.startTime); modulator.stop(opts.endTime);
        carrier.start(opts.startTime); carrier.stop(opts.endTime);
        state.sourceNodes.push(modulator, carrier);
    } else {
        osc = audioCtx.createOscillator();
        osc.type = opts.type;
        osc.frequency.setValueAtTime(opts.startFreq, opts.startTime);
        if (opts.endFreq) osc.frequency.linearRampToValueAtTime(opts.endFreq, opts.endTime);
    }
    
    mainGain = audioCtx.createGain();
    mainGain.gain.setValueAtTime(0, opts.startTime);
    mainGain.gain.linearRampToValueAtTime(opts.vol, opts.startTime + 0.01);
    mainGain.gain.exponentialRampToValueAtTime(0.001, opts.endTime);

    const panner = audioCtx.createStereoPanner();
    panner.pan.setValueAtTime(opts.pan, opts.startTime);
    
    let lastNode = mainGain;
    if (opts.filterParams) {
        const filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(opts.filterParams.freq, opts.startTime);
        filterNode.Q.setValueAtTime(opts.filterParams.q, opts.startTime);
        lastNode.connect(filterNode);
        lastNode = filterNode;
    }

    lastNode.connect(panner);
    panner.connect(mainOut);
    
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
    }
}

function updateExportButtonsState() {
    const isEmpty = !state.composition.strokes.length && !state.composition.symbols.length;
    const exportBtn = d.getElementById('exportBtn');
    el.exportJpgBtn.disabled = isEmpty;
    el.exportPdfBtn.disabled = isEmpty;
    el.exportWavBtn.disabled = isEmpty;
    if (exportBtn) exportBtn.disabled = isEmpty;
}

function yToFrequency(y) {
    const normalizedY = 1 - (y / el.canvas.height);
    const logMin = Math.log(FREQ_MIN);
    const logMax = Math.log(FREQ_MAX);
    return Math.exp(logMin + (logMax - logMin) * normalizedY);
}

function yFromFrequency(freq) {
    const logMin = Math.log(FREQ_MIN);
    const logMax = Math.log(FREQ_MAX);
    const normalizedFreq = (Math.log(freq) - logMin) / (logMax - logMin);
    return el.canvas.height * (1 - normalizedFreq);
}

function xToPan(x) { return (x / el.canvas.width) * 2 - 1; }

function getActiveFilterParams(x) {
    const activeFilter = state.composition.symbols.find(s => s.type === 'filter' && x >= s.x && x <= s.x + s.size * 2);
    if (activeFilter) {
        return {
            freq: (1 - (activeFilter.y / el.canvas.height)) * 5000 + 200,
            q: (activeFilter.size / 50) * 20
        };
    }
    return null;
}

function createImpulseResponse(ac) {
    const rate = ac.sampleRate, duration = 1.5, decay = 2;
    const impulse = ac.createBuffer(2, rate * duration, rate);
    for (let i = 0; i < 2; i++) {
        const channel = impulse.getChannelData(i);
        for (let j = 0; j < rate * duration; j++) {
            channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / (rate * duration), decay);
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
    if (['staccato', 'percussion', 'arpeggio', 'granular', 'tremolo', 'filter'].includes(toolName)) cursor = 'copy';
    if (toolName === 'glissando') cursor = 'pointer';
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
    redrawAll();
}

// --- EXPORT FUNCTIONS ---
function exportJpg() {
    const link = d.createElement('a');
    link.download = 'music-drawing.jpg';
    link.href = el.canvas.toDataURL('image/jpeg', 0.9);
    link.click();
}

function exportPdf() {
    const imgData = el.canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: el.canvas.width > el.canvas.height ? 'l' : 'p', unit: 'px', format: [el.canvas.width, el.canvas.height] });
    pdf.addImage(imgData, 'PNG', 0, 0, el.canvas.width, el.canvas.height);
    pdf.save('music-drawing.pdf');
}

async function exportWav() {
    el.loadingOverlay.classList.remove('hidden');
    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        let maxX = 0;
        state.composition.strokes.forEach(stroke => stroke.points.forEach(p => { if (p.x > maxX) maxX = p.x; }));
        state.composition.symbols.forEach(s => { if (s.x > maxX) maxX = s.x; });

        const duration = Math.max(1, Math.ceil(maxX / PIXELS_PER_SECOND) + 2); // Add 2s tail
        if (!state.composition.strokes.length && !state.composition.symbols.length) {
            throw new Error("A composição está vazia.");
        }
        
        const offlineCtx = new OfflineAudioContext(2, 44100 * duration, 44100);
        scheduleAllSounds(offlineCtx);
        const renderedBuffer = await offlineCtx.startRendering();
        const wav = bufferToWav(renderedBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });

        const link = d.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'music-drawing.wav';
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (error) {
        alert("Erro ao exportar áudio: " + error.message);
    } finally {
        el.loadingOverlay.classList.add('hidden');
    }
}

function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels, len = buffer.length * numOfChan * 2 + 44, view = new DataView(new ArrayBuffer(len));
    let pos = 0;
    const writeString = s => { for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i)); };
    
    writeString('RIFF'); view.setUint32(pos, len - 8, true); pos += 4;
    writeString('WAVE'); writeString('fmt ');
    view.setUint32(pos, 16, true); pos += 4;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint16(pos, numOfChan, true); pos += 2;
    view.setUint32(pos, buffer.sampleRate, true); pos += 4;
    view.setUint32(pos, buffer.sampleRate * 4, true); pos += 4;
    view.setUint16(pos, numOfChan * 2, true); pos += 2;
    view.setUint16(pos, 16, true); pos += 2;
    writeString('data');
    view.setUint32(pos, len - pos - 4, true); pos += 4;

    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
            let sample = buffer.getChannelData(channel)[i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            pos += 2;
        }
    }
    return view;
}

// --- STARTUP ---
d.addEventListener('DOMContentLoaded', () => {
    const pcModeBtn = d.getElementById('pc-mode-btn');
    const mobileModeBtn = d.getElementById('mobile-mode-btn');
    pcModeBtn.addEventListener('click', () => initApp('pc'));
    mobileModeBtn.addEventListener('click', () => initApp('mobile'));
});