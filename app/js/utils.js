import { FREQ_MIN, FREQ_MAX } from './constants.js';
import { uiElements } from './ui.js';

/**
 * Converte uma coordenada Y do canvas para uma frequência de áudio (Hz)
 * usando uma escala logarítmica para uma percepção de tom mais natural.
 */
export function yToFrequency(y) {
    const canvasHeight = uiElements.drawingCanvas.height;
    if (!canvasHeight || canvasHeight <= 0) return FREQ_MIN;

    // Normaliza a posição Y para o intervalo [0, 1], invertendo o eixo
    const normalizedY = 1 - (y / canvasHeight);
    const clampedY = Math.max(0, Math.min(1, normalizedY));

    // Mapeamento logarítmico
    const minLog = Math.log(FREQ_MIN);
    const maxLog = Math.log(FREQ_MAX);
    const scale = maxLog - minLog;
    const logResult = minLog + scale * clampedY;
    
    return Math.exp(logResult);
}

/**
 * Converte uma frequência de áudio (Hz) de volta para uma coordenada Y do canvas.
 * Também usa uma escala logarítmica para consistência.
 */
export function yFromFrequency(freq) {
    const canvasHeight = uiElements.drawingCanvas.height;
    if (!canvasHeight || canvasHeight <= 0) return 0;
    
    // Mapeamento logarítmico inverso
    const minLog = Math.log(FREQ_MIN);
    const maxLog = Math.log(FREQ_MAX);
    const scale = maxLog - minLog;
    
    // Garante que a frequência está dentro dos limites para evitar Math.log(<=0)
    const clampedFreq = Math.max(FREQ_MIN, Math.min(FREQ_MAX, freq));
    const normalizedLog = (Math.log(clampedFreq) - minLog) / scale;

    // Converte de volta para a coordenada Y (invertendo o eixo)
    return canvasHeight * (1 - normalizedLog);
}

export function xToPan(x) {
    const canvasWidth = uiElements.drawingCanvas.width;
    if (!canvasWidth) return 0;
    const pan = (x / canvasWidth) * 2 - 1;
    return Math.max(-1, Math.min(1, pan));
}

export function getMousePos(e, canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    return { x, y };
}