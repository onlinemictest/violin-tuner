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
import { closest, queue } from "./array-fns";
import { isTruthy, set, throttle, throwError } from "./helper-fns";
import { clamp, round } from "./math-fns";

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
type GuitarNoteName = keyof typeof GUITAR_FREQ;
const GUITAR_NOTES = Object.keys(GUITAR_FREQ) as GuitarNoteName[];
const GUITAR_FREQ_INV = new Map(Object.entries(GUITAR_FREQ).map(([a, b]) => [b, a])) as Map<number, GuitarNoteName>
const GUITAR_FREQ_VAL = Object.values(GUITAR_FREQ).sort();

const ANIM_DURATION = 350;

const translate = {
  X: 'translateX',
  Y: 'translateY',
};
let dir: keyof typeof translate;
dir = 'X';

const getClosestGuitarNote = (f: number) => GUITAR_FREQ_INV.get(closest(GUITAR_FREQ_VAL, f)) ?? throwError();

initGetUserMedia();

if (false
  || !('WebAssembly' in window)
  || !('AudioContext' in window)
  || !('createAnalyser' in AudioContext.prototype)
  || !('createScriptProcessor' in AudioContext.prototype)
) {
  if (!('WebAssembly' in window)) throw alert(`Browser not supported: 'WebAssembly' is not defined`);
  if (!('AudioContext' in window)) throw alert(`Browser not supported: 'AudioContext' is not defined`)
  if (!('createAnalyser' in AudioContext.prototype)) throw alert(`Browser not supported: 'AudioContext.prototype.createAnalyser' is not defined`)
  if (!('createScriptProcessor' in AudioContext.prototype)) throw alert(`Browser not supported: 'AudioContext.prototype.createScriptProcessor' is not defined`)
}

// @ts-expect-error
Aubio().then(({ Pitch }) => {
  const guitarTuner = document.getElementById('guitar-tuner') as HTMLDivElement | null;
  const startEl = document.getElementById('audio-start') as HTMLButtonElement | null;
  const pauseEl = document.getElementById('audio-pause') as HTMLButtonElement | null;
  const tuneUpText = document.getElementById('tune-up-text') as HTMLDivElement | null;
  const tuneDownText = document.getElementById('tune-down-text') as HTMLDivElement | null;
  const pressPlay = document.getElementById('circle-text-play') as HTMLSpanElement | null
  const pluckAString = document.getElementById('circle-text-pluck') as HTMLSpanElement | null;
  const errorEl = document.getElementById('circle-text-error') as HTMLSpanElement | null;
  const noteSpan = document.getElementById('circle-note') as HTMLSpanElement | null;
  const matchCircleL = document.getElementById('match-circle-l') as HTMLDivElement | null;
  const matchCircleR = document.getElementById('match-circle-r') as HTMLDivElement | null;
  const innerCircle = document.getElementById('inner-circle') as HTMLDivElement | null;
  const needleL = document.getElementById('needle-l') as HTMLDivElement | null;
  const needleR = document.getElementById('needle-r') as HTMLDivElement | null;

  const tunedJingle = document.getElementById('tuned-jingle') as HTMLAudioElement;
  tunedJingle.volume = 0.5;

  const noteEls = new Map(Object.entries(GUITAR_FREQ).map(([n]) => [n, document.getElementById(n) as unknown as SVGGElement]));
  const fillEls = new Map(Object.entries(GUITAR_FREQ).map(([n]) => [n, document.getElementById(`${n}-fill`) as unknown as SVGGElement]));

  if (false
    || !guitarTuner
    || !startEl
    || !pauseEl
    || !tuneUpText
    || !tuneDownText
    || !pressPlay
    || !pluckAString
    || !errorEl
    || !noteSpan
    || !matchCircleL
    || !matchCircleR
    || !innerCircle
    || !tunedJingle
    || !needleL
    || !needleR
    || ![...noteEls.values()].every(isTruthy)
    || ![...fillEls.values()].every(isTruthy)
  ) {
    return alert('Expected HTML element missing');
  }

  const updateTuneText = throttle(500, (isTooLow: boolean, isClose: boolean) => {
    if (isClose) {
      tuneUpText.classList.remove('show');
      tuneDownText.classList.remove('show');
    } else {
      tuneUpText.classList[isTooLow ? 'add' : 'remove']('show');
      tuneDownText.classList[isTooLow ? 'remove' : 'add']('show');
    }
  });

  const updateNeedles = (isTooLow: boolean, isClose: boolean) => {
    if (isClose) {
      needleL.style.display = 'none';
      needleR.style.display = 'none';
    } else {
      needleL.style.display = isTooLow ? 'block' : 'none';
      needleR.style.display = isTooLow ? 'none' : 'block';
    }
  }

  let audioContext: AudioContext;
  let analyser: AnalyserNode;
  let scriptProcessor: ScriptProcessorNode;
  let pitchDetector: Aubio.Pitch;
  // let stream: MediaStream;

  matchCircleL.style.transform = `${translate[dir]}(150%)`;

  const pauseCallback = () => {
    startEl.style.display = 'block';
    pauseEl.style.display = 'none';
    pressPlay.style.display = 'inline';
    pluckAString.style.display = 'none';
    noteSpan.style.display = 'none';
    matchCircleR.style.color = '';
    matchCircleL.style.transform = `${translate[dir]}(150%)`;
    tuneUpText.classList.remove('show');
    tuneDownText.classList.remove('show');
    toggleClass(startEl, 'blob-animation');
  };

  pauseEl.addEventListener('click', () => {
    scriptProcessor.disconnect(audioContext.destination);
    analyser.disconnect(scriptProcessor);
    audioContext.close();
    // stream.getTracks().forEach(track => track.stop());
    pauseCallback();
  });

  startEl.addEventListener('click', async () => {
    guitarTuner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    startEl.style.display = 'none';
    pauseEl.style.display = 'block';
    toggleClass(pauseEl, 'shrink-animation');
    await new Promise(r => requestAnimationFrame(r));

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    pitchDetector = new Pitch('default', BUFFER_SIZE, 1, audioContext.sampleRate);
    // pitchDetector.setSilence(-70);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // stream = s;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      pressPlay.style.display = 'none';
      errorEl.style.display = 'none';
      pluckAString.style.display = 'inline';
      matchCircleL.style.visibility = 'visible';

      // let prevCents = -50;
      // let prevNote = '';

      let resetable = false;
      let softResettable = false;
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
            matchCircleL.style.transform = `${translate[dir]}(150%)`;
            tuneUpText.classList.remove('show');
            tuneDownText.classList.remove('show');
          }
        }
        else if (note.name && !Number.isNaN(note.cents)) {
          if (tunedJingle.paused) {
            resetable = true;
            softResettable = true;

            const noteName = `${note.name}_${note.octave}`;
            const guitarNoteName = getClosestGuitarNote(frequency);

            // Show tune up/down text iff frequency is way off (more than 25 cents)
            const isTooLow = frequency < GUITAR_FREQ[guitarNoteName];
            const isClose = noteName === guitarNoteName && note.cents < 5;
            updateTuneText(isTooLow, isClose);
            updateNeedles(isTooLow, isClose);

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

            // matchCircleR.style.transform = `translateY(${note.cents}%)`;
            pluckAString.style.display = 'none';
            noteSpan.style.display = 'inline';
            noteSpan.innerText = guitarNoteName.split('_')[0];

            const centsBuffer = centsBufferMap.get(noteName) ?? [];
            if (noteName === guitarNoteName && centsUI === 0) centsBuffer.push(0);

            const tuneRatio = clamp((centsBuffer.length - 1) / TUNE_BUFFER_SIZE);
            // console.log(noteName, tuneRatio)
            innerCircle.style.transition = `transform ${ANIM_DURATION}ms ease`
            innerCircle.style.transform = `scale(${1 - tuneRatio})`;

            matchCircleR.style.transition = `color ${ANIM_DURATION}ms ease`
            matchCircleR.style.color = tuneRatio === 1 ? '#fff' : '#fff8';

            matchCircleL.style.transition = `transform ${ANIM_DURATION}ms ease`;
            matchCircleL.style.transform = `${translate[dir]}(${centsUI * (1 - tuneRatio) * (dir === 'Y' ? -1 : 1)}%)`;

            if (tuneRatio === 1 && !jinglePlayed) {
              setTimeout(() => tunedJingle.play(), ANIM_DURATION); // give animation time to finish
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
        else if (softResettable) {
          // console.log('soft reset');
          innerCircle.style.transition = 'transform 100ms'
          innerCircle.style.transform = `scale(1)`;
          softResettable = false;
          jinglePlayed = false;
          centsBufferMap = new Map(GUITAR_NOTES.map(nn => [nn, []]));
        }

        // // console.log(pauseBuffer)
        // queue(pauseBuffer, note.name);
      });
    } catch (err) {
      pauseCallback();
      pressPlay.style.display = 'none';
      errorEl.innerText = err.message;
      errorEl.style.display = 'block';
    };
  });
});
