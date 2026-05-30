import { useEffect, useRef } from 'react';

interface GridNode {
  x: number;
  y: number;
  baseOpacity: number;
  pulsePhase: number;
  pulseSpeed: number;
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLS = 24;
    const ROWS = 16;
    let nodes: GridNode[] = [];
    let animId: number;
    let lastTs = 0;
    let time = 0;

    function buildGrid(w: number, h: number) {
      nodes = [];
      const cellW = w / (COLS - 1);
      const cellH = h / (ROWS - 1);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          nodes.push({
            x: c * cellW,
            y: r * cellH,
            baseOpacity: 0.06 + Math.random() * 0.1,
            pulsePhase: Math.random() * Math.PI * 2,
            pulseSpeed: 0.3 + Math.random() * 0.5,
          });
        }
      }
    }

    function draw(ts = 0) {
      if (!canvas || !ctx) return;
      const delta = lastTs ? (ts - lastTs) / 1000 : 0.016;
      lastTs = ts;
      time += delta;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Aristas
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n) continue;
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const edgeAlpha =
          n.baseOpacity * (0.5 + 0.5 * Math.sin(time * n.pulseSpeed + n.pulsePhase));

        // Arista derecha
        if (col < COLS - 1) {
          const next = nodes[i + 1];
          if (next) {
            const midX = (n.x + next.x) / 2;
            const midY = (n.y + next.y) / 2;
            const hover = Math.max(0, 1 - Math.hypot(midX - mx, midY - my) / 180) * 0.18;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,255,255,${(edgeAlpha + hover).toFixed(3)})`;
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(next.x, next.y);
            ctx.stroke();
          }
        }

        // Arista inferior
        if (row < ROWS - 1) {
          const below = nodes[i + COLS];
          if (below) {
            const midX = (n.x + below.x) / 2;
            const midY = (n.y + below.y) / 2;
            const hover = Math.max(0, 1 - Math.hypot(midX - mx, midY - my) / 180) * 0.18;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,255,255,${(edgeAlpha + hover).toFixed(3)})`;
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(below.x, below.y);
            ctx.stroke();
          }
        }
      }

      // Nodos
      for (const n of nodes) {
        const dist = Math.hypot(n.x - mx, n.y - my);
        const hover = Math.max(0, 1 - dist / 120) * 0.5;
        const alpha = Math.max(
          0.04,
          n.baseOpacity * (0.5 + 0.5 * Math.sin(time * n.pulseSpeed + n.pulsePhase)) + hover,
        );
        const radius = 1 + hover * 2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    function resize() {
      if (!canvas) return;
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
      if (animId) cancelAnimationFrame(animId);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      buildGrid(canvas.width, canvas.height);
      lastTs = 0;
      animId = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onMouseLeave() {
      mouseRef.current = { x: -9999, y: -9999 };
    }
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  // Ticker: reloj en tiempo real
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    const update = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      el.textContent = `${hh}:${mm}:${ss}`;
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '2rem',
          left: '2rem',
          right: '2rem',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <span
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.625rem',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.2)',
            }}
          >
            simpleTPV
          </span>
          <span
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.625rem',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.15)',
            }}
          >
            Punto de venta · POS
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            ref={tickerRef}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.6875rem',
              fontVariantNumeric: 'tabular-nums',
              color: 'rgba(255,255,255,0.2)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
