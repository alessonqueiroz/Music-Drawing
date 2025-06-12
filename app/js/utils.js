import { FREQ_MIN, FREQ_MAX } from './constants.js';
import { uiElements } from './ui.js';

export function yToFrequency(y) {
    // CORRIGIDO
    const canvasHeight = uiElements.drawingCanvas.height;
    const normalizedY = Math.max(0, Math.min(1, y / canvasHeight));
    return FREQ_MAX - (normalizedY * (FREQ_MAX - FREQ_MIN));
}

export function yFromFrequency(freq) {
    // CORRIGIDO
    const canvasHeight = uiElements.drawingCanvas.height;
    const normalizedFreq = (freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);
    return canvasHeight - (normalizedFreq * canvasHeight);
}

export function xToPan(x) {
    // CORRIGIDO
    return (x / uiElements.drawingCanvas.width) * 2 - 1;
}

export function getMousePos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}