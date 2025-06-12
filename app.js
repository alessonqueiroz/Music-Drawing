// script.js - Music Drawing App (versão revisada com inicialização DOM segura e correção do bug do áudio)

// Aguarda o DOM carregar antes de inicializar
document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES ---
    const MAX_DURATION_SECONDS = 600;
    const PIXELS_PER_SECOND = 40;
    const FREQ_MIN = 100;
    const FREQ_MAX = 2000;
    const ERASE_RADIUS = 20;

    // --- ELEMENTOS DOM ---
    const d = document;
    const { jsPDF } = window.jspdf;

    // Elementos
    const el = {
        playBtn: d.getElementById('playBtn'),
        playIcon: d.getElementById('playIcon'),
        pauseIcon: d.getElementById('pauseIcon'),
        playBtnText: d.querySelector('#playBtn span'),
        playhead: d.getElementById('playhead'),
        colorPicker: d.getElementById('colorPicker'),
        lineWidth: d.getElementById('lineWidth'),
        clearBtn: d.getElementById('clearBtn'),
        themeToggle: d.getElementById('theme-toggle'),
        themeSun: d.getElementById('theme-icon-sun'),
        themeMoon: d.getElementById('theme-icon-moon'),
        loadingOverlay: d.getElementById('loading-overlay'),
        mainCanvasArea: d.getElementById('main-canvas-area'),
        canvasContainer: d.getElementById('canvas-container'),
        canvas: d.getElementById('drawingCanvas'),
        yRulerCanvas: d.getElementById('y-ruler-canvas'),
        xRulerCanvas: d.getElementById('x-ruler-canvas'),
        xRulerContainer: d.getElementById('x-ruler-container') || {},
        exportJpgBtn: d.getElementById('exportJpgBtn'),
        exportPdfBtn: d.getElementById('exportPdfBtn'),
        exportWavBtn: d.getElementById('exportWavBtn'),
        undoBtn: d.getElementById('undoBtn'),
        redoBtn: d.getElementById('redoBtn'),
        reverbSlider: d.getElementById('reverb'),
        delaySlider: d.getElementById('delay'),
        distortionSlider: d.getElementById('distortion'),
        tools: {
            pencil: d.getElementById('pencil'),
            eraser: d.getElementById('eraser'),
            staccato: d.getElementById('staccato'),
            percussion: d.getElementById('percussion'),
            arpeggio: d.getElementById('arpeggio'),
            glissando: d.getElementById('glissando'),
            granular: d.getElementById('granular'),
            tremolo: d.getElementById('tremolo'),
            filter: d.getElementById('filter'),
        },
        timbres: {
            pluck: d.getElementById('pluck'),
            sine: d.getElementById('sine'),
            square: d.getElementById('square'),
            sawtooth: d.getElementById('sawtooth'),
            triangle: d.getElementById('triangle'),
            pad: d.getElementById('pad'),
            bass: d.getElementById('bass'),
            lead: d.getElementById('lead'),
            noise: d.getElementById('noise'),
            fm: d.getElementById('fm'),
        }
    };

    // Contextos de canvas
    const ctx = el.canvas.getContext('2d');
    const yRulerCtx = el.yRulerCanvas.getContext('2d');
    const xRulerCtx = el.xRulerCanvas.getContext('2d');

    // --- ESTADO GLOBAL ---
    const state = {
        activeTool: 'pencil',
        activeTimbre: 'pluck',
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

    // --- FUNÇÕES PRINCIPAIS ---

    function init() {
        setupEventListeners();
        applyTheme(localStorage.getItem('pauta-aberta-theme') || 'light');
        setActiveTool('pencil');
        setActiveTimbre('pluck');
        resizeAndRedraw();
        saveState();
    }

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
        if (el.playBtn) el.playBtn.addEventListener('click', togglePlayback);
        if (el.clearBtn) el.clearBtn.addEventListener('click', handleClear);
        if (el.themeToggle) el.themeToggle.addEventListener('click', () => applyTheme(d.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
        Object.keys(el.tools).forEach(key => {
            if (el.tools[key]) el.tools[key].addEventListener('click', () => setActiveTool(key));
        });
        Object.keys(el.timbres).forEach(key => {
            if (el.timbres[key]) el.timbres[key].addEventListener('click', () => setActiveTimbre(key));
        });
        if (el.exportJpgBtn) el.exportJpgBtn.addEventListener('click', exportJpg);
        if (el.exportPdfBtn) el.exportPdfBtn.addEventListener('click', exportPdf);
        if (el.exportWavBtn) el.exportWavBtn.addEventListener('click', exportWav);
        if (el.undoBtn) el.undoBtn.addEventListener('click', undo);
        if (el.redoBtn) el.redoBtn.addEventListener('click', redo);
        window.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
            if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
        });
    }

    function resizeAndRedraw() {
        const canvasWidth = MAX_DURATION_SECONDS * PIXELS_PER_SECOND;
        const canvasHeight = el.mainCanvasArea.offsetHeight;
        el.canvas.width = canvasWidth;
        el.canvas.height = canvasHeight;
        el.canvasContainer.style.width = `${canvasWidth}px`;
        el.canvasContainer.style.height = `${canvasHeight}px`;
        el.yRulerCanvas.width = 50;
        el.yRulerCanvas.height = canvasHeight;
        el.xRulerCanvas.width = canvasWidth;
        el.xRulerCanvas.height = 30;
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

    function drawSymbol(s) {
        ctx.save();
        ctx.fillStyle = s.color;
        ctx.strokeStyle = s.color;
        const size = s.size;
        ctx.lineWidth = Math.max(2, size / 10);
        switch (s.type) {
            case 'staccato':
                ctx.beginPath();
                ctx.arc(s.x, s.y, size / 4, 0, 2 * Math.PI);
                ctx.fill();
                break;
            case 'percussion':
                ctx.beginPath();
                ctx.moveTo(s.x - size / 2, s.y - size / 2);
                ctx.lineTo(s.x + size / 2, s.y + size / 2);
                ctx.moveTo(s.x + size / 2, s.y - size / 2);
                ctx.lineTo(s.x - size / 2, s.y + size / 2);
                ctx.stroke();
                break;
            case 'glissando':
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(s.endX, s.endY);
                ctx.stroke();
                break;
            case 'arpeggio':
                ctx.lineWidth = Math.max(2, size / 15);
                ctx.beginPath();
                ctx.moveTo(s.x - size, s.y + size / 2);
                ctx.bezierCurveTo(s.x - size / 2, s.y - size, s.x + size / 2, s.y + size, s.x + size, s.y - size / 2);
                ctx.stroke();
                break;
            case 'granular':
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = s.color;
                ctx.fillRect(s.x - size, s.y - size / 2, size * 2, size);
                ctx.globalAlpha = 1.0;
                break;
            case 'tremolo':
                ctx.beginPath();
                ctx.moveTo(s.x - size, s.y);
                ctx.lineTo(s.x - size / 2, s.y - size / 2);
                ctx.lineTo(s.x, s.y);
                ctx.lineTo(s.x + size / 2, s.y + size / 2);
                ctx.lineTo(s.x + size, s.y);
                ctx.stroke();
                break;
            case 'filter':
                ctx.globalAlpha = 0.2;
                ctx.fillStyle = s.color;
                ctx.fillRect(s.x, 0, size * 2, el.canvas.height);
                ctx.globalAlpha = 1.0;
                ctx.beginPath();
                ctx.moveTo(s.x, s.y - size / 2);
                ctx.lineTo(s.x, s.y + size / 2);
                ctx.lineTo(s.x + 10, s.y);
                ctx.closePath();
                ctx.fillStyle = s.color;
                ctx.fill();
                break;
        }
        ctx.restore();
    }

    function drawRulers() {
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || "#888";
        const rulerFont = '10px Inter';
        yRulerCtx.clearRect(0, 0, el.yRulerCanvas.width, el.yRulerCanvas.height);
        yRulerCtx.fillStyle = textColor;
        yRulerCtx.font = rulerFont;
        yRulerCtx.textAlign = 'right';
        yRulerCtx.textBaseline = 'middle';
        for (let freq = FREQ_MIN; freq <= FREQ_MAX; freq += 100) {
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

    // --- FUNÇÕES DE INTERAÇÃO ---

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
                const newStroke = {
                    id: Date.now(),
                    points: [pos],
                    color: el.colorPicker.value,
                    lineWidth: el.lineWidth.value,
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
        if (el.xRulerContainer) el.xRulerContainer.scrollLeft = e.target.scrollLeft;
    }

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

    function eraseAt(x, y) {
        let somethingWasErased = false;
        const initialSymbolCount = state.composition.symbols.length;
        state.composition.symbols = state.composition.symbols.filter(s => {
            const dist = Math.hypot(s.x - x, s.y - y);
            return dist > ERASE_RADIUS;
        });
        if (state.composition.symbols.length < initialSymbolCount) somethingWasErased = true;
        state.composition.strokes.forEach(stroke => {
            const initialLength = stroke.points.length;
            stroke.points = stroke.points.filter(p => Math.hypot(p.x - x, p.y - y) > ERASE_RADIUS);
            if (stroke.points.length < initialLength) somethingWasErased = true;
        });
        state.composition.strokes = state.composition.strokes.filter(stroke => stroke.points.length > 1);
        if (somethingWasErased) {
            redrawAll();
        }
    }

    // --- HISTÓRICO E UNDO/REDO ---
    function saveState() {
        state.history.length = state.historyIndex + 1;
        const snapshot = JSON.parse(JSON.stringify(state.composition));
        state.history.push(snapshot);
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
        if (el.undoBtn) el.undoBtn.disabled = state.historyIndex <= 0;
        if (el.redoBtn) el.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
    }

    function updateExportButtonsState() {
        const isEmpty = !state.composition.strokes.length && !state.composition.symbols.length;
        if (el.exportJpgBtn) el.exportJpgBtn.disabled = isEmpty;
        if (el.exportPdfBtn) el.exportPdfBtn.disabled = isEmpty;
        if (el.exportWavBtn) el.exportWavBtn.disabled = isEmpty;
        const exportBtn = d.getElementById('exportBtn');
        if (exportBtn) exportBtn.disabled = isEmpty;
    }

    // --- THEME E FERRAMENTAS ---
    function setActiveTool(toolName) {
        state.activeTool = toolName;
        state.glissandoStart = null;
        Object.values(el.tools).forEach(btn => btn && btn.classList.remove('active'));
        if (el.tools[toolName]) el.tools[toolName].classList.add('active');
        let cursor = 'crosshair';
        if (['staccato', 'percussion', 'arpeggio', 'granular', 'tremolo', 'filter'].includes(toolName)) cursor = 'copy';
        if (toolName === 'glissando') cursor = 'pointer';
        if (toolName === 'eraser') cursor = 'cell';
        el.canvas.style.cursor = cursor;
    }

    function setActiveTimbre(timbreName) {
        state.activeTimbre = timbreName;
        Object.values(el.timbres).forEach(btn => btn && btn.classList.remove('active'));
        if (el.timbres[timbreName]) el.timbres[timbreName].classList.add('active');
    }

    function applyTheme(theme) {
        d.documentElement.setAttribute('data-theme', theme);
        if (el.themeSun) el.themeSun.classList.toggle('hidden', theme === 'dark');
        if (el.themeMoon) el.themeMoon.classList.toggle('hidden', theme !== 'dark');
        localStorage.setItem('pauta-aberta-theme', theme);
        redrawAll();
    }

    // --- EXPORTAÇÕES ---
    function exportJpg() {
        const link = d.createElement('a');
        link.download = 'pauta-aberta.jpg';
        link.href = el.canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    }

    function exportPdf() {
        const imgData = el.canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: el.canvas.width > el.canvas.height ? 'l' : 'p', unit: 'px', format: [el.canvas.width, el.canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, el.canvas.width, el.canvas.height);
        pdf.save('pauta-aberta.pdf');
    }

    async function exportWav() {
        if (el.loadingOverlay) el.loadingOverlay.classList.remove('hidden');
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            // Calcule duração máxima da composição, não use sempre MAX_DURATION_SECONDS
            let maxX = 0;
            state.composition.strokes.forEach(stroke => {
                stroke.points.forEach(p => { if (p.x > maxX) maxX = p.x; });
            });
            state.composition.symbols.forEach(s => { if (s.x > maxX) maxX = s.x; });
            const duration = Math.max(1, Math.ceil(maxX / PIXELS_PER_SECOND));
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
            link.download = 'pauta-aberta.wav';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (error) {
            console.error("Erro ao renderizar o áudio:", error);
            alert("Ocorreu um erro ao tentar exportar o áudio: " + error.message);
        } finally {
            if (el.loadingOverlay) el.loadingOverlay.classList.add('hidden');
        }
    }

    function bufferToWav(buffer) {
        const numOfChan = buffer.numberOfChannels,
            len = buffer.length * numOfChan * 2 + 44,
            view = new DataView(new ArrayBuffer(len));
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

    // --- ÁUDIO (corrigido para funcionar sempre após interação) ---
    async function initAudio() {
        // Se não houver contexto, crie um novo
        if (!state.audioCtx || state.audioCtx.state === 'closed') {
            try {
                state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.error('Web Audio API não é suportada.');
                alert('Seu navegador não suporta a Web Audio API, que é necessária para esta aplicação.');
            }
        }
        // Se estiver suspenso (pausado), tente retomar
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            await state.audioCtx.resume();
        }
    }

    function togglePlayback() {
        if (!state.composition.strokes.length && !state.composition.symbols.length) return;
        state.isPlaying ? stopPlayback() : startPlayback();
    }

    async function startPlayback() {
        await initAudio();
        state.isPlaying = true;
        el.playhead.style.left = `${el.mainCanvasArea.scrollLeft}px`;
        el.playhead.classList.remove('hidden');
        el.playIcon.classList.add('hidden');
        el.pauseIcon.classList.remove('hidden');
        el.playBtnText.textContent = "Parar";
        scheduleAllSounds(state.audioCtx);
        animatePlayhead();
    }

    function stopPlayback() {
        state.isPlaying = false;
        state.sourceNodes.forEach(node => {
            try { node.stop(0); } catch (e) { /* ignore */ }
        });
        state.sourceNodes = [];
        // Em vez de fechar, apenas suspenda o contexto para evitar bugs e permitir play subsequente
        if (state.audioCtx && state.audioCtx.state === 'running') {
            state.audioCtx.suspend();
        }
        cancelAnimationFrame(state.animationFrameId);
        el.playhead.classList.add('hidden');
        el.playIcon.classList.remove('hidden');
        el.pauseIcon.classList.add('hidden');
        el.playBtnText.textContent = "Tocar";
    }

    function animatePlayhead() {
        if (!state.isPlaying) return;
        const startX = el.mainCanvasArea.scrollLeft;
        const startTime = state.audioCtx.currentTime;
        function frame() {
            if (!state.isPlaying) return;
            const elapsedTime = state.audioCtx.currentTime - startTime;
            const currentX = startX + (elapsedTime * PIXELS_PER_SECOND);
            if (currentX >= el.canvas.width) {
                stopPlayback();
                return;
            }
            el.playhead.style.left = `${currentX}px`;
            state.animationFrameId = requestAnimationFrame(frame);
        }
        state.animationFrameId = requestAnimationFrame(frame);
    }

    function makeDistortionCurve(amount) {
        if (amount === 0) return null;
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            const x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    function scheduleAllSounds(audioCtx) {
        const now = audioCtx.currentTime;
        state.sourceNodes = [];

        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-10, now);
        compressor.knee.setValueAtTime(0, now);
        compressor.ratio.setValueAtTime(20, now);
        compressor.attack.setValueAtTime(0.003, now);
        compressor.release.setValueAtTime(0.25, now);
        compressor.connect(audioCtx.destination);

        const distortionNode = audioCtx.createWaveShaper();
        distortionNode.curve = makeDistortionCurve(parseFloat(el.distortionSlider.value));
        distortionNode.oversample = '4x';
        distortionNode.connect(compressor);

        const mainSoundSource = distortionNode;

        const reverbGain = audioCtx.createGain();
        reverbGain.gain.value = parseFloat(el.reverbSlider.value);
        const reverbNode = audioCtx.createConvolver();
        reverbNode.buffer = createImpulseResponse(audioCtx);
        mainSoundSource.connect(reverbGain).connect(reverbNode).connect(compressor);

        const delayGain = audioCtx.createGain();
        delayGain.gain.value = parseFloat(el.delaySlider.value);
        const delayNode = audioCtx.createDelay(1.0);
        delayNode.delayTime.value = 0.5;
        const delayFeedback = audioCtx.createGain();
        delayFeedback.gain.value = 0.4;
        mainSoundSource.connect(delayGain).connect(delayNode).connect(delayFeedback).connect(delayNode);
        delayNode.connect(compressor);

        const mainOut = audioCtx.createGain();
        mainOut.connect(distortionNode);

        scheduleStrokes(audioCtx, now, mainOut, state.composition.strokes);
        scheduleSymbols(audioCtx, now, mainOut);
    }

    function scheduleStrokes(audioCtx, now, mainOut, strokesToProcess) {
        const continuousTimbres = ['sine', 'square', 'sawtooth', 'triangle', 'pad', 'bass', 'lead'];

        strokesToProcess.forEach(stroke => {
            if (stroke.points.length < 2) return;
            const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;

            if (continuousTimbres.includes(stroke.timbre)) {
                // Lógica para som contínuo e fluido
                const panner = audioCtx.createStereoPanner();
                const mainGain = audioCtx.createGain();
                mainGain.connect(panner).connect(mainOut);

                const firstPoint = stroke.points[0];
                const lastPoint = stroke.points[stroke.points.length - 1];
                const startTime = now + firstPoint.x / PIXELS_PER_SECOND;
                const endTime = now + lastPoint.x / PIXELS_PER_SECOND;

                let oscillators = [];
                let osc1, osc2;
                osc1 = audioCtx.createOscillator();
                oscillators.push(osc1);

                if (['pad', 'lead'].includes(stroke.timbre)) {
                    osc2 = audioCtx.createOscillator();
                    osc1.type = 'sawtooth';
                    osc2.type = 'sawtooth';
                    osc2.connect(mainGain);
                    oscillators.push(osc2);
                } else if (stroke.timbre === 'bass') {
                    osc1.type = 'sawtooth';
                    const lowpass = audioCtx.createBiquadFilter();
                    lowpass.type = 'lowpass';
                    lowpass.frequency.value = 600;
                    osc1.connect(lowpass).connect(mainGain);
                } else {
                    osc1.type = stroke.timbre;
                    osc1.connect(mainGain);
                }

                mainGain.gain.setValueAtTime(0, now);
                mainGain.gain.linearRampToValueAtTime(vol, startTime + 0.01);

                stroke.points.forEach(point => {
                    const pointTime = now + point.x / PIXELS_PER_SECOND;
                    const freq = yToFrequency(point.y);
                    osc1.frequency.linearRampToValueAtTime(freq, pointTime);
                    if (osc2) {
                        osc2.frequency.linearRampToValueAtTime(freq * 1.012, pointTime);
                    }
                });

                panner.pan.setValueAtTime(xToPan(firstPoint.x), startTime);
                panner.pan.linearRampToValueAtTime(xToPan(lastPoint.x), endTime);

                mainGain.gain.setValueAtTime(vol, endTime);
                mainGain.gain.linearRampToValueAtTime(0, endTime + 0.2);

                oscillators.forEach(osc => {
                    osc.start(startTime);
                    osc.stop(endTime + 0.2);
                    state.sourceNodes.push(osc);
                });

            } else {
                // Lógica antiga (correta para timbres discretos) - cria um som para cada segmento
                for (let i = 0; i < stroke.points.length - 1; i++) {
                    const p1 = stroke.points[i];
                    const p2 = stroke.points[i + 1];
                    const startTime = now + p1.x / PIXELS_PER_SECOND;
                    const endTime = now + p2.x / PIXELS_PER_SECOND;
                    if (endTime <= startTime) continue;

                    createDiscreteTone(audioCtx, {
                        type: stroke.timbre,
                        startTime: startTime,
                        duration: endTime - startTime,
                        freq: yToFrequency(p1.y),
                        endFreq: yToFrequency(p2.y),
                        vol: vol,
                        pan: xToPan(p1.x)
                    }, mainOut);
                }
            }
        });
    }

    function scheduleSymbols(audioCtx, now, mainOut) {
        state.composition.symbols.forEach(s => {
            const startTime = now + (s.x / PIXELS_PER_SECOND);
            const vol = 0.1 + (s.size / 50) * 0.4;
            const pan = xToPan(s.x);
            const freq = yToFrequency(s.y);

            switch (s.type) {
                case 'staccato':
                    createDiscreteTone(audioCtx, { type: 'triangle', startTime, duration: 0.08, freq, vol, pan }, mainOut);
                    break;
                case 'percussion':
                    createDiscreteTone(audioCtx, { type: 'noise', startTime, duration: 0.1, freq, vol, pan }, mainOut);
                    break;
                case 'arpeggio':
                    const intervals = [1, 5 / 4, 3 / 2, 2];
                    intervals.forEach((interval, i) => {
                        createDiscreteTone(audioCtx, { type: 'triangle', startTime: startTime + i * 0.05, duration: 0.1, freq: freq * interval, vol, pan }, mainOut);
                    });
                    break;
                case 'glissando':
                    const strokeFromGlissando = {
                        points: [{ x: s.x, y: s.y }, { x: s.endX, y: s.endY }],
                        lineWidth: s.size,
                        timbre: s.timbre
                    };
                    scheduleStrokes(audioCtx, now, mainOut, [strokeFromGlissando]);
                    break;
            }
        });
    }

    function createDiscreteTone(audioCtx, opts, mainOut) {
        let osc, mainGain;
        const endTime = opts.startTime + opts.duration;

        mainGain = audioCtx.createGain();
        mainGain.gain.setValueAtTime(0, opts.startTime);

        const panner = audioCtx.createStereoPanner();
        panner.pan.setValueAtTime(opts.pan, opts.startTime);
        mainGain.connect(panner).connect(mainOut);

        switch (opts.type) {
            case 'pluck':
                const pluckTime = 1.0 / opts.freq;
                const delay = audioCtx.createDelay(1.0);
                delay.delayTime.value = pluckTime;
                const feedback = audioCtx.createGain();
                feedback.gain.value = 0.98;
                const noise = audioCtx.createBufferSource();
                const bufferSize = audioCtx.sampleRate * 0.05;
                const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const output = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
                noise.buffer = buffer;
                noise.connect(delay);
                delay.connect(feedback).connect(delay);
                delay.connect(mainGain);
                noise.start(opts.startTime);
                noise.stop(opts.startTime + 0.05);
                state.sourceNodes.push(noise);
                break;
            case 'noise':
                osc = audioCtx.createBufferSource();
                const bufferSizeNoise = audioCtx.sampleRate * opts.duration;
                const bufferNoise = audioCtx.createBuffer(1, bufferSizeNoise, audioCtx.sampleRate);
                const outputNoise = bufferNoise.getChannelData(0);
                for (let i = 0; i < bufferSizeNoise; i++) outputNoise[i] = Math.random() * 2 - 1;
                osc.buffer = bufferNoise;
                osc.connect(mainGain);
                osc.start(opts.startTime);
                osc.stop(endTime);
                state.sourceNodes.push(osc);
                break;
            case 'fm':
                const carrier = audioCtx.createOscillator();
                carrier.type = 'sine';
                carrier.frequency.setValueAtTime(opts.freq, opts.startTime);
                if (opts.endFreq) carrier.frequency.linearRampToValueAtTime(opts.endFreq, endTime);
                const modulator = audioCtx.createOscillator();
                modulator.type = 'square';
                modulator.frequency.setValueAtTime(opts.freq * 1.5, opts.startTime);
                const modGain = audioCtx.createGain();
                modGain.gain.setValueAtTime(opts.freq * 0.75, opts.startTime);
                modulator.connect(modGain).connect(carrier.frequency);
                carrier.connect(mainGain);
                modulator.start(opts.startTime);
                modulator.stop(endTime);
                carrier.start(opts.startTime);
                carrier.stop(endTime);
                state.sourceNodes.push(modulator, carrier);
                break;
            default: // Ondas básicas
                osc = audioCtx.createOscillator();
                osc.type = opts.type;
                osc.frequency.setValueAtTime(opts.freq, opts.startTime);
                if (opts.endFreq) osc.frequency.linearRampToValueAtTime(opts.endFreq, endTime);
                osc.connect(mainGain);
                osc.start(opts.startTime);
                osc.stop(endTime);
                state.sourceNodes.push(osc);
                break;
        }

        mainGain.gain.setTargetAtTime(opts.vol, opts.startTime, 0.01);
        mainGain.gain.exponentialRampToValueAtTime(0.001, endTime);
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

    // --- CONVERSÕES AUXILIARES ---
    function yToFrequency(y) {
        const normalizedY = Math.max(0, Math.min(1, y / el.canvas.height));
        return FREQ_MAX - (normalizedY * (FREQ_MAX - FREQ_MIN));
    }

    function yFromFrequency(freq) {
        const normalizedFreq = (freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);
        return el.canvas.height - (normalizedFreq * el.canvas.height);
    }

    function xToPan(x) { return (x / el.canvas.width) * 2 - 1; }

    // --- INICIALIZAÇÃO FINAL ---
    init();
});