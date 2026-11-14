// Written with AI assistance (Claude); see the README.
import React from 'react';
import { Composition, continueRender, delayRender } from 'remotion';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import { DEFAULT_PROPS, DemoProps, Main } from './Main';
import { FPS, TOTAL } from './timeline';

// Wait for the two product fonts before any frame is captured.
const fontHandle = delayRender('fonts');
Promise.all([
  document.fonts.load("500 58px 'Archivo Variable'"),
  document.fonts.load("400 58px 'Archivo Variable'"),
  document.fonts.load("italic 400 150px 'Source Serif 4 Variable'"),
]).then(() => continueRender(fontHandle), () => continueRender(fontHandle));

export const RemotionRoot: React.FC = () => (
  <Composition<any, DemoProps>
    id="EarthriseDemo"
    component={Main}
    durationInFrames={TOTAL}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={DEFAULT_PROPS}
  />
);
