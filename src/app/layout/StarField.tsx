import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  layer: 0 | 1;
  twinkle: boolean;
  twinkleSpeed: number;
  twinklePhase: number;
}

const FAR_DRIFT = { x: 0.0025, y: 0.0015 };
const NEAR_DRIFT = { x: 0.006, y: 0.0035 };
const MAX_STARS = 600;
const STAR_DENSITY = 1 / 7000;
const TWINKLE_FRACTION = 0.16;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: true });

    if (!context) {
      return;
    }

    // Explicitly capture the already-validated non-null values.
    const canvasElement: HTMLCanvasElement = canvas;
    const ctx: CanvasRenderingContext2D = context;

    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rafId = 0;
    let lastFrame = 0;

    function buildStars(w: number, h: number) {
      const count = Math.min(
        MAX_STARS,
        Math.max(100, Math.round(w * h * STAR_DENSITY)),
      );

      const next: Star[] = [];

      for (let i = 0; i < count; i += 1) {
        const layer: 0 | 1 = Math.random() < 0.62 ? 0 : 1;

        next.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius:
  layer === 0
    ? Math.random() * 0.9 + 0.45
    : Math.random() * 1.6 + 0.7,
          baseAlpha:
  layer === 0
    ? Math.random() * 0.35 + 0.35
    : Math.random() * 0.45 + 0.55,
          layer,
          twinkle: Math.random() < TWINKLE_FRACTION,
          twinkleSpeed: Math.random() * 0.0012 + 0.0004,
          twinklePhase: Math.random() * Math.PI * 2,
        });
      }

      stars = next;
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvasElement.width = Math.round(width * dpr);
      canvasElement.height = Math.round(height * dpr);
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      buildStars(width, height);
    }

    function draw(elapsedMs: number, animate: boolean) {
      ctx.clearRect(0, 0, width, height);

      const isDark = document.documentElement.classList.contains("dark");

      for (const star of stars) {
        const drift = star.layer === 0 ? FAR_DRIFT : NEAR_DRIFT;

        const dx = animate ? (elapsedMs * drift.x) % width : 0;
        const dy = animate ? (elapsedMs * drift.y) % height : 0;

        const x = (((star.x + dx) % width) + width) % width;
        const y = (((star.y + dy) % height) + height) % height;

        let alpha = star.baseAlpha;

        if (animate && star.twinkle) {
          alpha *=
            0.7 +
            0.3 *
              Math.sin(
                elapsedMs * star.twinkleSpeed + star.twinklePhase,
              );
        }

        const themeAlpha = alpha;

        ctx.beginPath();
        ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(
          themeAlpha,
          0,
        ).toFixed(3)})`;
        ctx.fill();
      }
    }

    const reducedMotion = prefersReducedMotion();

    function loop(timestamp: number) {
      if (timestamp - lastFrame >= 33) {
        lastFrame = timestamp;

        if (!document.hidden) {
          draw(timestamp, true);
        }
      }

      rafId = requestAnimationFrame(loop);
    }

    resize();
    draw(0, false);

    if (!reducedMotion) {
      rafId = requestAnimationFrame(loop);
    }

    const onResize = () => {
      resize();
      draw(performance.now(), !reducedMotion);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);

      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
  >
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
    />
  </div>
);
}