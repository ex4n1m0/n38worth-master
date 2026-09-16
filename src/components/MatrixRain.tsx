"use client";

/**
 * Matrix-style falling code rain on a <canvas>.
 *
 * Performance-conscious by design (this is a background decoration):
 * - Pauses when the element scrolls out of view (IntersectionObserver).
 * - Pauses when the tab is hidden (visibilitychange).
 * - Disabled entirely for prefers-reduced-motion users.
 * - Column steps run on a ~66ms interval, not per-frame; only newly drawn
 *   glyphs are painted each step and a translucent black fill fades tails.
 */

import { useEffect, useRef } from "react";

interface MatrixRainProps {
  /** Tail length / fade speed. Lower = longer trails. Default 0.08. */
  fade?: number;
  /** Glyph font size in px. Default 16. */
  fontSize?: number;
  /** Glyph color. Default matrix green. */
  color?: string;
  /** Head-of-column highlight color (drawn on the leading glyph). */
  headColor?: string;
  /** Opacity of the whole canvas element (CSS). Default 1. */
  opacity?: number;
  className?: string;
}

const GLYPHS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>/\\[]=+*#$%&@";

export function MatrixRain({
  fade = 0.08,
  fontSize = 16,
  color = "#00ff41",
  headColor = "#b4ffc8",
  opacity = 1,
  className,
}: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let columns = 0;
    let drops: number[] = [];
    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = true;

    const parent = canvas.parentElement;

    const resize = () => {
      // Match the canvas to its own CSS box (it is absolutely positioned to
      // fill its parent, so measure the parent).
      const w = parent?.clientWidth ?? canvas.clientWidth;
      const h = parent?.clientHeight ?? canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w;
      canvas.height = h;
      columns = Math.ceil(w / fontSize);
      drops = Array.from({ length: columns }, () => Math.floor(Math.random() * (h / fontSize)));
      ctx.font = `${fontSize}px monospace`;
      // Solid first frame so resize doesn't leave a blank flash.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
    };

    const step = () => {
      if (!visible) return;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Leading glyph is brighter — draws the "head" of the stream.
        ctx.fillStyle = headColor;
        ctx.fillText(glyph, x, y);
        // Slightly delayed body glyph one cell up gives streams depth.
        if (y > fontSize * 2) {
          const body = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          ctx.fillStyle = color;
          ctx.fillText(body, x, y - fontSize);
        }

        // Reset the column to the top at random intervals.
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };

    const start = () => {
      if (timer || reduced) return;
      timer = setInterval(step, 66);
      step();
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    resize();

    if (reduced) {
      // Static single frame of glyphs so reduced-motion users still get
      // texture without animation.
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fillText(
          GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          Math.random() * canvas.width,
          Math.random() * canvas.height
        );
      }
      ctx.globalAlpha = 1;
    } else {
      start();
    }

    const onResize = () => {
      resize();
    };
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let observer: IntersectionObserver | null = null;
    if (parent) {
      observer = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true;
          if (visible && !document.hidden) start();
          else stop();
        },
        { threshold: 0 }
      );
      observer.observe(parent);
    }

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, [color, headColor, fade, fontSize]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}
      style={{ opacity }}
    />
  );
}
