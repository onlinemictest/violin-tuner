/**
 * Copyright (C) 2021 Online Mic Test
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 * @license
 */

import { initGetUserMedia } from "./init-get-user-media";
import { toggleClass } from "./dom-fns";
import { getNote } from "./music-fns";
import { groupedUntilChanged } from "./iter";

console.log('Licensed under AGPL-3.0: https://github.com/onlinemictest/guitar-tuner')

const BUFFER_SIZE = 2 ** 13;

// Note buffer sizes
const PREV_BUFFER_SIZE = Math.ceil(3 / 2);
const NOOP_BUFFER_SIZE = 36 / 2;
const TUNE_BUFFER_SIZE = 12 / 2;

const GUITAR_FREQ = {
  'E_4': 329.63,
  'B_3': 246.94,
  'G_3': 196.00,
  'D_3': 146.83,
  'A_2': 110.00,
  'E_2': 82.41,
};
const GUITAR_NOTES = Object.keys(GUITAR_FREQ);
const GUITAR_FREQ_INV = new Map(Object.entries(GUITAR_FREQ).map(([a, b]) => [b, a])) as Map<number, keyof (typeof GUITAR_FREQ)>
const GUITAR_FREQ_VAL = Object.values(GUITAR_FREQ).sort();

// Helper fns
const set = (obj: any, prop: any, value: any) => obj && (obj[prop] = value);
const isTruthy = (x: any) => !!x;
const isFalsey = (x: any) => !x;

// Math fns
// const floor = (n: number, basis = 1) => Math.floor(n / basis) * basis;
// const ceil = (n: number, basis = 1) => Math.ceil(n / basis) * basis;
const round = (n: number, basis = 1) => Math.round(n / basis) * basis;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

// Array fns
const queue = <T>(a: T[] | null | undefined, x: T) => (a?.pop(), a?.unshift(x), a);
const throwError = (m?: string) => { throw Error(m) };
const closest = (a: number[], goal: number) => a.reduce((prev, curr) =>
  (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev));

const getClosestGuitarNote = (f: number) => GUITAR_FREQ_INV.get(closest(GUITAR_FREQ_VAL, f)) ?? throwError();

// @ts-expect-error
Aubio().then(({ Pitch }) => {
  initGetUserMedia();

  if (
    !('WebAssembly' in window) ||
    !('AudioContext' in window) ||
    !('createAnalyser' in AudioContext.prototype) ||
    !('createScriptProcessor' in AudioContext.prototype) ||
    !('trunc' in Math)
  ) {
    return alert('Browser not supported');
  }

  const startEl = document.getElementById('audio-start') as HTMLButtonElement | null;
  const pauseEl = document.getElementById('audio-pause') as HTMLButtonElement | null;
  const tuneUpText = document.getElementById('tune-up-text') as HTMLDivElement | null;
  const tuneDownText = document.getElementById('tune-down-text') as HTMLDivElement | null;
  const pressPlay = document.getElementById('circle-text-play') as HTMLSpanElement | null
  const pluckAString = document.getElementById('circle-text-pluck') as HTMLSpanElement | null;
  const noteSpan = document.getElementById('circle-text-note') as HTMLSpanElement | null;
  const matchCircleL = document.getElementById('match-circle-l') as HTMLDivElement | null;
  const matchCircleR = document.getElementById('match-circle-r') as HTMLDivElement | null;
  const innerCircle = document.getElementById('inner-circle') as HTMLDivElement | null;

  const tunedJingle = document.getElementById('tuned-jingle') as HTMLAudioElement;
  tunedJingle.volume = 0.5;

  const noteEls = new Map(Object.entries(GUITAR_FREQ).map(([n]) => [n, document.getElementById(n) as unknown as SVGGElement]));
  const fillEls = new Map(Object.entries(GUITAR_FREQ).map(([n]) => [n, document.getElementById(`${n}-fill`) as unknown as SVGGElement]));

  if (false
    || !startEl
    || !pauseEl
    || !tuneUpText
    || !tuneDownText
    || !pressPlay
    || !pluckAString
    || !noteSpan
    || !matchCircleL
    || !matchCircleR
    || !innerCircle
    || !tunedJingle
    || ![...noteEls.values()].every(isTruthy)
    || ![...fillEls.values()].every(isTruthy)
  ) {
    return alert('Expected HTML element missing');
  }

  let audioContext: AudioContext;
  let analyser: AnalyserNode;
  let scriptProcessor: ScriptProcessorNode;
  let pitchDetector: Aubio.Pitch;
  // let stream: MediaStream;

  pauseEl.addEventListener('click', () => {
    scriptProcessor.disconnect(audioContext.destination);
    analyser.disconnect(scriptProcessor);
    audioContext.close();
    // stream.getTracks().forEach(track => track.stop());

    startEl.style.display = 'block';
    pauseEl.style.display = 'none';
    pressPlay.style.display = 'inline';
    pluckAString.style.display = 'none';
    noteSpan.style.display = 'none';
    matchCircleR.style.color = '';
    matchCircleL.style.transform = `translateX(125%)`;
    tuneUpText.classList.remove('show');
    tuneDownText.classList.remove('show');
    toggleClass(startEl, 'blob-animation');
  })

  startEl.addEventListener('click', () => {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    pitchDetector = new Pitch('default', BUFFER_SIZE, 1, audioContext.sampleRate);
    // pitchDetector.setSilence(-70);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      // stream = s;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      startEl.style.display = 'none';
      pauseEl.style.display = 'block';
      pressPlay.style.display = 'none';
      pluckAString.style.display = 'inline';
      toggleClass(pauseEl, 'shrink-animation');

      matchCircleL.style.visibility = 'visible';

      // let prevCents = -50;
      // let prevNote = '';

      let resetable = false;
      let softResetable = false;
      let jinglePlayed = false;

      /** The last 3 notes excluding undefined */
      const prevNotes: string[] = new Array(PREV_BUFFER_SIZE).fill(undefined);

      /** The last 36 notes (prox. 2 seconds). Used to fully reset the UI when there's only noise. */
      const noopBuffer: string[] = new Array(NOOP_BUFFER_SIZE).fill(undefined);

      /** A buffer of the last 36 cents values for each guitar note. Used to determine if a string is tuned. */
      let centsBufferMap: Map<string, number[]> = new Map(GUITAR_NOTES.map(nn => [nn, []]));

      // /** The last 3 notes including undefined. Used to reset the cents buffer between plucks of the string */
      // const pauseBuffer: string[] = new Array(PREV_BUFFER_SIZE).fill(undefined);

      scriptProcessor.addEventListener('audioprocess', event => {
        // console.timeEnd('foo');
        // console.time('foo');

        const buffer = event.inputBuffer.getChannelData(0)
        // const volume = volumeAudioProcess(buffer);
        const frequency = pitchDetector.do(buffer);
        const note = getNote(frequency);

        queue(noopBuffer, note.name);

        // If there has been nothing but noise for the last couple of seconds, show the message again:
        const isNoise = [...groupedUntilChanged(noopBuffer.filter(isTruthy))].every(g => g.length <= 3);
        if (isNoise) {
          if (resetable) {
            resetable = false;
            pressPlay.style.display = 'none';
            pluckAString.style.display = 'inline';
            noteSpan.style.display = 'none';
            matchCircleR.style.color = '';
            matchCircleL.style.transform = `translateX(125%)`;
            tuneUpText.classList.remove('show');
            tuneDownText.classList.remove('show');
          }
        }
        else if (note.name && !Number.isNaN(note.cents)) {
          if (tunedJingle.paused) {
            resetable = true;
            softResetable = true;

            const noteName = `${note.name}_${note.octave}`;
            const guitarNoteName = getClosestGuitarNote(frequency);

            // Show tune up/down text iff frequency is way off (more than 25 cents)
            const isTooLow = frequency < GUITAR_FREQ[guitarNoteName];
            if (noteName === guitarNoteName && note.cents < 25) {
              tuneUpText.classList.remove('show');
              tuneDownText.classList.remove('show');
            } else {
              tuneUpText.classList[isTooLow ? 'add' : 'remove']('show');
              tuneDownText.classList[isTooLow ? 'remove' : 'add']('show');
            }

            // console.log(note);

            // if (prevNote == note.name)
            // const degDiff = Math.trunc(Math.abs(prevDeg - deg));
            // prevDeg = deg;
            // const transformTime = (degDiff + 25) * 15;
            // console.log(noteName, note.cents)

            const baseCents = noteName === guitarNoteName
              ? note.cents
              : isTooLow ? -85 : 85;

            const absCents100 = Math.abs(baseCents) * 2;
            const sensitivity = Math.min(10, Math.round(100 / absCents100));
            const centsUI = round(baseCents, sensitivity);

            // console.log(`${absCents2}/100 => %${sensitivity} => ${Math.abs(centsApprox) * 2}/100`);
            // const centsApprox = note.cents;
            // console.log(centsApprox)

            // const transitionTime = 200 + Math.abs(prevCents - centsApprox) * 10;
            // console.log(transitionTime)

            // matchCircleR.style.transform = `translateX(${note.cents}%)`;
            pluckAString.style.display = 'none';
            noteSpan.style.display = 'inline';
            noteSpan.innerText = guitarNoteName.split('_')[0];

            const centsBuffer = centsBufferMap.get(noteName) ?? [];
            if (noteName === guitarNoteName && centsUI === 0) centsBuffer.push(0);

            const tuneRatio = clamp(centsBuffer.length / TUNE_BUFFER_SIZE);
            // console.log(noteName, tuneRatio)
            innerCircle.style.transition = `transform 350ms ease`
            innerCircle.style.transform = `scale(${1 - tuneRatio})`;

            matchCircleR.style.transition = `color 350ms ease`
            matchCircleR.style.color = tuneRatio === 1 ? '#fff' : '#fff8';

            matchCircleL.style.transition = `transform 350ms ease`;
            matchCircleL.style.transform = `translateX(${centsUI * (1 - tuneRatio)}%)`;

            if (tuneRatio === 1 && !jinglePlayed) {
              tunedJingle.play();
              set(noteEls.get(guitarNoteName)?.querySelector('path')?.style, 'fill', 'rgb(67,111,142)');
              set(fillEls.get(guitarNoteName)?.style, 'display', 'block');
              jinglePlayed = true;
            }

            // console.log(`Streak: ${centsHits.length}/${centsBuffer.length}`)

            // prevCents = centsUI;
            // prevNote = noteName;
          }

          queue(prevNotes, note.name);
        }
        else if (softResetable) {
          // console.log('soft reset');
          innerCircle.style.transition = 'transform 100ms'
          innerCircle.style.transform = `scale(1)`;
          softResetable = false;
          jinglePlayed = false;
          centsBufferMap = new Map(GUITAR_NOTES.map(nn => [nn, []]));
        }

        // // console.log(pauseBuffer)
        // queue(pauseBuffer, note.name);
      });
    });
  });
});
