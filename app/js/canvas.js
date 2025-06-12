import { state } from './state.js';
import { uiElements } from './ui.js';
import { PIXELS_PER_SECOND, MAX_DURATION_SECONDS, ERASE_RADIUS, FREQ_MIN, FREQ_MAX } from './constants.js';
import { yFromFrequency } from './utils.js';

/**
 * Redesenha completamente o canvas principal e as réguas.
 */
export function redrawAll() {
    const { ctx, drawingCanvas } = uiElements;
    if (!ctx) return;
    
    ctx.clearRect(50,50, drawingCanvas.width, drawingCanvas.height);

    // Desenha os traços (strokes)
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

    // Desenha os símbolos
    state.composition.symbols.forEach(s => drawSymbol(s));
    
    drawRulers();
}

/**
 * Desenha um único símbolo no canvas.
 * @param {object} s - O objeto do símbolo a ser desenhado.
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
        // Adicione outros casos de símbolos aqui...
    }
    ctx.restore();
}

/**
 * Desenha as réguas de frequência (Y) e tempo (X).
 */
function drawRulers() {
    const { yRulerCtx, xRulerCtx, yRulerCanvas, xRulerCanvas, drawingCanvas } = uiElements;
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || "#888";
    const rulerFont = '10px Inter';

    // Régua Y (Frequência)
    yRulerCtx.clearRect(0, 0, yRulerCanvas.width, yRulerCanvas.height);
    yRulerCtx.fillStyle = textColor;
    yRulerCtx.font = rulerFont;
    yRulerCtx.textAlign = 'right';
    yRulerCtx.textBaseline = 'middle';
    for (let freq = FREQ_MIN; freq <= FREQ_MAX; freq += 100) {
        if (freq % 200 !== 0 && freq !== FREQ_MIN) continue;
        const yPos = yFromFrequency(freq);
        if (yPos > 0 && yPos < drawingCanvas.height) {
            yRulerCtx.fillRect(yRulerCanvas.width - 10, yPos, 10, 1);
            yRulerCtx.fillText(`${Math.round(freq)}`, yRulerCanvas.width - 15, yPos);
        }
    }

    // Régua X (Tempo)
    xRulerCtx.clearRect(0, 0, xRulerCanvas.width, xRulerCanvas.height);
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

/**
 * Redimensiona os canvas para se ajustarem ao contêiner e redesenha tudo.
 */
export function resizeAndRedraw() {
    const { drawingCanvas, canvasContainer, yRulerCanvas, xRulerCanvas, mainCanvasArea } = uiElements;

    const canvasWidth = MAX_DURATION_SECONDS * PIXELS_PER_SECOND;
    const canvasHeight = mainCanvasArea.offsetHeight;

    drawingCanvas.width = canvasWidth;
    drawingCanvas.height = canvasHeight;
    canvasContainer.style.width = `${canvasWidth}px`;
    canvasContainer.style.height = `${canvasHeight}px`;

    yRulerCanvas.width = 50;
    yRulerCanvas.height = canvasHeight;

    xRulerCanvas.width = canvasWidth;
    xRulerCanvas.height = 30;

    redrawAll();
}

/**
 * Apaga traços e símbolos dentro de um raio específico.
 * @param {number} x - Coordenada X do centro do apagador.
 * @param {number} y - Coordenada Y do centro do apagador.
 */
export function eraseAt(x, y) {
    let somethingWasErased = false;
    
    // Apaga símbolos
    const initialSymbolCount = state.composition.symbols.length;
    state.composition.symbols = state.composition.symbols.filter(s => {
        const dist = Math.hypot(s.x - x, s.y - y);
        return dist > ERASE_RADIUS;
    });
    if (state.composition.symbols.length < initialSymbolCount) {
        somethingWasErased = true;
    }

    // Apaga pontos de traços
    state.composition.strokes.forEach(stroke => {
        const initialLength = stroke.points.length;
        stroke.points = stroke.points.filter(p => Math.hypot(p.x - x, p.y - y) > ERASE_RADIUS);
        if (stroke.points.length < initialLength) {
            somethingWasErased = true;
        }
    });

    // Remove traços que ficaram vazios
    state.composition.strokes = state.composition.strokes.filter(stroke => stroke.points.length > 1);

    if (somethingWasErased) {
        redrawAll();
    }
}
