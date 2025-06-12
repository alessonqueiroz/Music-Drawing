import { state } from './state.js';
import { uiElements, showLoading } from './ui.js';
import { PIXELS_PER_SECOND } from './constants.js';
import { yToFrequency, xToPan } from './utils.js';

/**
 * Inicializa ou retoma o AudioContext. Essencial para navegadores que exigem interação do usuário.
 */
export async function initAudio() {
    if (!state.audioCtx || state.audioCtx.state === 'closed') {
        try {
            state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error('Web Audio API não é suportada.');
            alert('Seu navegador não suporta a Web Audio API, que é necessária para esta aplicação.');
            return;
        }
    }
    if (state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
    }
}

/**
 * Para a reprodução de todos os sons e suspende o AudioContext.
 */
export async function stopAllSounds() {
    state.sourceNodes.forEach(node => {
        try { node.stop(0); } catch (e) { /* Ignora erros se o nó já parou */ }
    });
    state.sourceNodes = [];
    if (state.audioCtx && state.audioCtx.state === 'running') {
        await state.audioCtx.suspend();
    }
}

/**
 * Orquestra a criação de todos os nós de áudio e agenda a reprodução.
 * @param {AudioContext | OfflineAudioContext} audioCtx - O contexto de áudio a ser usado.
 */
export function scheduleAllSounds(audioCtx) {
    const now = audioCtx.currentTime;
    const mainOut = createEffectsChain(audioCtx);

    scheduleStrokes(audioCtx, now, mainOut);
    scheduleSymbols(audioCtx, now, mainOut);
}

/**
 * Cria a cadeia de efeitos de áudio (Distorção, Reverb, Delay).
 * @param {AudioContext | OfflineAudioContext} audioCtx - O contexto de áudio.
 * @returns {AudioNode} - O nó de entrada da cadeia de efeitos.
 */
function createEffectsChain(audioCtx) {
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.connect(audioCtx.destination);

    // Efeitos
    const distortionNode = audioCtx.createWaveShaper();
    // CORREÇÃO: Verifica se o elemento 'distortion' existe antes de usar seu valor.
    const distortionValue = uiElements.distortion ? parseFloat(uiElements.distortion.value) : 0;
    distortionNode.curve = makeDistortionCurve(distortionValue);
    distortionNode.oversample = '4x';
    distortionNode.connect(compressor);

    const reverbGain = audioCtx.createGain();
    // CORREÇÃO: Verifica se o elemento 'reverb' existe.
    reverbGain.gain.value = uiElements.reverb ? parseFloat(uiElements.reverb.value) : 0;
    const reverbNode = audioCtx.createConvolver();
    reverbNode.buffer = createImpulseResponse(audioCtx);
    distortionNode.connect(reverbGain).connect(reverbNode).connect(compressor);

    const delayGain = audioCtx.createGain();
    // CORREÇÃO: Verifica se o elemento 'delay' existe.
    delayGain.gain.value = uiElements.delay ? parseFloat(uiElements.delay.value) : 0;
    const delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = 0.5;
    const delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.4;
    distortionNode.connect(delayGain).connect(delayNode).connect(delayFeedback).connect(delayNode);
    delayNode.connect(compressor);

    // O nó principal que recebe o som de todas as fontes
    const mainIn = audioCtx.createGain();
    mainIn.connect(distortionNode);

    return mainIn;
}

/**
 * Agenda os sons para os traços (strokes).
 */
function scheduleStrokes(audioCtx, now, mainOut) {
    const continuousTimbres = ['sine', 'square', 'sawtooth', 'triangle', 'pad', 'bass', 'lead'];
    
    state.composition.strokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        const vol = 0.1 + (stroke.lineWidth / 50) * 0.4;

        if (continuousTimbres.includes(stroke.timbre)) {
            // Lógica para timbres contínuos (osciladores)
            const panner = audioCtx.createStereoPanner();
            const mainGain = audioCtx.createGain();
            mainGain.connect(panner).connect(mainOut);

            const firstPoint = stroke.points[0];
            const lastPoint = stroke.points[stroke.points.length - 1];
            const startTime = now + firstPoint.x / PIXELS_PER_SECOND;
            const endTime = now + lastPoint.x / PIXELS_PER_SECOND;

            const osc = audioCtx.createOscillator();
            osc.type = stroke.timbre;
            osc.connect(mainGain);

            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
            
            stroke.points.forEach(point => {
                const pointTime = now + point.x / PIXELS_PER_SECOND;
                const freq = yToFrequency(point.y);
                osc.frequency.linearRampToValueAtTime(freq, pointTime);
            });

            panner.pan.setValueAtTime(xToPan(firstPoint.x), startTime);
            panner.pan.linearRampToValueAtTime(xToPan(lastPoint.x), endTime);

            mainGain.gain.setValueAtTime(vol, endTime);
            mainGain.gain.linearRampToValueAtTime(0, endTime + 0.2);

            osc.start(startTime);
            osc.stop(endTime + 0.2);
            state.sourceNodes.push(osc);

        } else {
             // Lógica para timbres discretos (sons percussivos como pluck)
            for (let i = 0; i < stroke.points.length - 1; i++) {
                const p1 = stroke.points[i];
                const p2 = stroke.points[i + 1];
                const startTime = now + p1.x / PIXELS_PER_SECOND;
                const endTime = now + p2.x / PIXELS_PER_SECOND;
                if (endTime <= startTime) continue;

                createDiscreteTone(audioCtx, mainOut, {
                    type: stroke.timbre,
                    startTime: startTime,
                    duration: endTime - startTime,
                    freq: yToFrequency(p1.y),
                    endFreq: yToFrequency(p2.y),
                    vol: vol,
                    pan: xToPan(p1.x)
                });
            }
        }
    });
}

/**
 * Agenda os sons para os símbolos.
 */
function scheduleSymbols(audioCtx, now, mainOut) {
    state.composition.symbols.forEach(s => {
        const startTime = now + (s.x / PIXELS_PER_SECOND);
        const vol = 0.1 + (s.size / 50) * 0.4;
        const pan = xToPan(s.x);
        const freq = yToFrequency(s.y);

        switch (s.type) {
            case 'staccato':
                createDiscreteTone(audioCtx, mainOut, { type: 'triangle', startTime, duration: 0.08, freq, vol, pan });
                break;
            case 'percussion':
                createDiscreteTone(audioCtx, mainOut, { type: 'noise', startTime, duration: 0.1, freq, vol, pan });
                break;
            // Adicione outros casos de símbolos aqui...
        }
    });
}

/**
 * Cria e agenda um único som discreto.
 */
function createDiscreteTone(audioCtx, mainOut, opts) {
    const { type, startTime, duration, freq, endFreq, vol, pan } = opts;
    let sourceNode;
    const endTime = startTime + duration;
    
    const mainGain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    panner.pan.setValueAtTime(pan, startTime);
    mainGain.connect(panner).connect(mainOut);

    switch (type) {
        case 'pluck':
            // Implementação simplificada de Karplus-Strong
            sourceNode = audioCtx.createBufferSource();
            const bufferSize = audioCtx.sampleRate * duration;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const output = buffer.getChannelData(0);
            for (let i = 0; i < Math.floor(audioCtx.sampleRate / freq); i++) {
                output[i] = Math.random() * 2 - 1;
            }
            for (let i = Math.floor(audioCtx.sampleRate / freq); i < bufferSize; i++) {
                const index = i - Math.floor(audioCtx.sampleRate / freq);
                output[i] = (output[index] + output[index + 1]) * 0.5 * 0.996;
            }
            sourceNode.buffer = buffer;
            break;
        
        case 'noise':
            sourceNode = audioCtx.createBufferSource();
            const noiseBufferSize = audioCtx.sampleRate * duration;
            const noiseBuffer = audioCtx.createBuffer(1, noiseBufferSize, audioCtx.sampleRate);
            const noiseOutput = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseBufferSize; i++) {
                noiseOutput[i] = Math.random() * 2 - 1;
            }
            sourceNode.buffer = noiseBuffer;
            break;
            
        default: // para sine, square, sawtooth, triangle
            sourceNode = audioCtx.createOscillator();
            sourceNode.type = type;
            sourceNode.frequency.setValueAtTime(freq, startTime);
            if (endFreq) sourceNode.frequency.linearRampToValueAtTime(endFreq, endTime);
            break;
    }

    sourceNode.connect(mainGain);
    sourceNode.start(startTime);
    sourceNode.stop(endTime);
    state.sourceNodes.push(sourceNode);

    mainGain.gain.setValueAtTime(0, startTime);
    mainGain.gain.setTargetAtTime(vol, startTime, 0.01);
    mainGain.gain.exponentialRampToValueAtTime(0.001, endTime);
}

// --- Funções Auxiliares de Efeitos e Exportação ---

function makeDistortionCurve(amount) {
    if (amount === 0) return null;
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
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

function bufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const len = buffer.length * numOfChan * 2 + 44;
    const view = new DataView(new ArrayBuffer(len));
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

/**
 * Renderiza a composição para um arquivo WAV e inicia o download.
 */
export async function exportWav() {
    showLoading(true);
    try {
        await new Promise(resolve => setTimeout(resolve, 100)); // Deixa a UI atualizar
        let maxX = 0;
        state.composition.strokes.forEach(stroke => stroke.points.forEach(p => { if (p.x > maxX) maxX = p.x; }));
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

        const link = document.createElement('a');
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
        showLoading(false);
    }
}