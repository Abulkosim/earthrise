// Written with AI assistance (Claude); see the README.
// blur-slide (video-shotcraft typography/blur-slide, demos/typography/blur-slide/BlurSlide.tsx):
// words rise out of focus; opacity, translateY and blur share ONE progress p and ONE easing (the card's core rule).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C } from '../tokens';
import { EASE, ramp } from './Polish';

export type WordSpec = { text: string; color?: string; tail?: string; style?: React.CSSProperties };

/** Parse 'sun:Sunlight and earth:Earth' into words; sun:/earth: words take the product's Sun / Earth hue. */
export const parseWords = (s: string): WordSpec[] =>
  s.split(' ').map((w) => {
    // trailing punctuation keeps the text colour: "sun:Sun," -> gold "Sun" + grey ","
    const m = w.match(/^(sun|earth):(.*?)([.,;:!?]*)$/);
    if (m) return { text: m[2], color: m[1] === 'sun' ? C.sun : C.earth, tail: m[3] };
    return { text: w };
  });

export const Words: React.FC<{
  words: WordSpec[];
  start: number; // first word start frame (relative to the parent sequence)
  stagger: number; // frames between words (card: 4f titles, 2.4f subtitles)
  dur: number; // per-word entrance window (card: 22f titles, 20f subtitles)
  dy: number; // px rise (card: ~0.38em titles, smaller for subtitles)
  blur: number; // px max blur (card: 18 titles, 9 subtitles)
  gap?: string;
  style?: React.CSSProperties;
  out?: number; // frame at which the line starts to fade out (optional)
  outDur?: number;
}> = ({ words, start, stagger, dur, dy, blur, gap = '0.26em', style, out, outDur = 7 }) => {
  const frame = useCurrentFrame();
  const fade = out === undefined ? 1 : 1 - ramp(frame, out, outDur, EASE.swift);
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'baseline', gap, whiteSpace: 'nowrap', opacity: fade, ...style }}>
      {words.map((w, i) => {
        const p = ramp(frame, start + i * stagger, dur, EASE.out);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${((1 - p) * dy).toFixed(2)}px)`,
              filter: p >= 0.999 ? undefined : `blur(${((1 - p) * blur).toFixed(2)}px)`,
              color: w.color,
              ...w.style,
            }}
          >
            {w.text}
            {w.tail ? <span style={{ color: style?.color }}>{w.tail}</span> : null}
          </span>
        );
      })}
    </div>
  );
};
