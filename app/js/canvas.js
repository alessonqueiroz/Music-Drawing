import { state } from './state.js';
import { uiElements } from './ui.js';
import { PIXELS_PER_SECOND, MAX_DURATION_SECONDS, ERASE_RADIUS, FREQ_MIN, FREQ_MAX } from './constants.js';
import { yFromFrequency } from './utils.js';

/**
 * Redesenha completamente o canvas principal e as réguas.
 */
export function redrawAll() {
    const { ctx, drawingCanvas } = uiElements;
    if (!ctx || !drawingCanvas || drawingCanvas.width === 0) return;
    
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

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

/**
 * Desenha um único símbolo no canvas.
 */
function drawSymbol(s) {
    const { ctx } = uiElements;
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
    }
    ctx.restore();
}

/**
 * Desenha as réguas de frequência (Y) e tempo (X).
 */
function drawRulers() {
    const { yRulerCtx, xRulerCtx, yRulerCanvas, xRulerCanvas } = uiElements;
    if (!yRulerCtx || !xRulerCtx) return;

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || "#88888";
    // CORREÇÃO: Adiciona uma fonte de fallback.
    const rulerFont = '10px Inter, sans-serif';

    // Régua Y (Frequência)
    yRulerCtx.clearRect(0, 0, yRulerCanvas.width, yRulerCanvas.height);
    yRulerCtx.fillStyle = textColor;
    yRulerCtx.font = rulerFont;
    yRulerCtx.textAlign = 'right';
    yRulerCtx.textBaseline = 'middle';
    
    const noteIntervals = [110, 220, 440, 880, 1760];
    noteIntervals.forEach(freq => {
        if (freq >= FREQ_MIN && freq <= FREQ_MAX) {
            const yPos = yFromFrequency(freq);
            yRulerCtx.fillRect(yRulerCanvas.width - 15, yPos, 15, 1);
            yRulerCtx.fillText(`${Math.round(freq)}Hz`, yRulerCanvas.width - 20, yPos);
        }
    });

    // Régua X (Tempo)
    xRulerCtx.clearRect(0, 0, xRulerCanvas.width, xRulerCanvas.height);
    xRulerCtx.fillStyle = textColor;
    xRulerCtx.font = rulerFont;
    xRulerCtx.textAlign = 'center';
    xRulerCtx.textBaseline = 'top';
    for (let sec = 0; sec <= MAX_DURATION_SECONDS; sec++) {
        const xPos = sec * PIXELS_PER_SECOND;
        if (xPos > xRulerCanvas.width) break;

        if (sec % 5 === 0) {
            xRulerCtx.fillRect(xPos, 0, 1, 10);
            xRulerCtx.fillText(`${sec}s`, xPos, 12);
        } else {
            xRulerCtx.fillRect(xPos, 0, 1, 5);
        }
    }
}

/**
 * Redimensiona os canvas para se ajustarem ao contêiner e redesenha tudo.
 */
export function resizeAndRedraw() {
    const { drawingCanvas, canvasContainer, yRulerCanvas, xRulerCanvas, mainCanvasArea, yRulerContainer, xRulerContainer } = uiElements;
    if (!mainCanvasArea) return;

    const canvasWidth = MAX_DURATION_SECONDS * PIXELS_PER_SECOND;
    const canvasHeight = mainCanvasArea.offsetHeight;

    if (canvasHeight <= 0) return;

    drawingCanvas.width = canvasWidth;
    drawingCanvas.height = canvasHeight;
    canvasContainer.style.width = `${canvasWidth}px`;
    canvasContainer.style.height = `${canvasHeight}px`;

    if (yRulerCanvas && yRulerContainer) {
        yRulerCanvas.width = yRulerContainer.offsetWidth;
        yRulerCanvas.height = canvasHeight;
    }

    if (xRulerCanvas && xRulerContainer) {
        xRulerCanvas.width = canvasWidth;
        xRulerCanvas.height = xRulerContainer.offsetHeight;
    }

    redrawAll();
}

/**
 * Apaga traços e símbolos dentro de um raio específico.
 */
export function eraseAt(x, y) {
    let somethingWasErased = false;
    const eraseRadiusSquared = ERASE_RADIUS * ERASE_RADIUS;

    state.composition.symbols = state.composition.symbols.filter(s => {
        const dx = s.x - x;
        const dy = s.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= eraseRadiusSquared) somethingWasErased = true;
        return distSq > eraseRadiusSquared;
    });

    state.composition.strokes.forEach(stroke => {
        const initialLength = stroke.points.length;
        stroke.points = stroke.points.filter(p => {
            const dx = p.x - x;
            const dy = p.y - y;
            return (dx * dx + dy * dy) > eraseRadiusSquared;
        });
        if (stroke.points.length < initialLength) {
            somethingWasErased = true;
        }
    });

    state.composition.strokes = state.composition.strokes.filter(stroke => stroke.points.length > 1);

    if (somethingWasErased) {
        redrawAll();
    }
}