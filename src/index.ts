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
import { getNote, NoteString, Octave } from "./music-fns";
import { groupedUntilChanged } from "./iter";
import { closest, closestBy, flat, queue, range } from "./array-fns";
import { isTruthy, once, set, throttle, throwError, timeout } from "./helper-fns";
import { clamp, round } from "./math-fns";

console.log('Licensed under AGPL-3.0: https://github.com/onlinemictest/guitar-tuner')

const BUFFER_SIZE = 8192;
const INTERVAL_TIME = 185; // ms

// Note buffer sizes
const NOTE_BUFFER_SIZE = 15; 
const TUNE_BUFFER_SIZE = 4;

const NOTE_STRINGS: NoteString[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES: Octave[] = [1, 2, 3, 4, 5, 6, 7, 8];
const NOTES = flat(OCTAVES.map(o => NOTE_STRINGS.map(n => `${n}_${o}`)));

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
// const GUITAR_FREQ_INV = new Map(Object.entries(GUITAR_FREQ).map(([a, b]) => [b, a])) as Map<number, GuitarNoteName>
// const GUITAR_FREQ_VAL = Object.values(GUITAR_FREQ).sort();

const ANIM_DURATION = 350;

const translate = {
  X: 'translateX',
  Y: 'translateY',
};

// const getClosestGuitarNoteByFreq = (f: number) => GUITAR_FREQ_INV.get(closest(GUITAR_FREQ_VAL, f)) ?? throwError();
const getClosestGuitarNote = (n: `${NoteString}_${Octave}`) => 
  closestBy(GUITAR_NOTES, n, (a, b) => Math.abs(NOTES.indexOf(a) - NOTES.indexOf(b))) as GuitarNoteName;

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
    || ![...noteEls.values()].every(isTruthy)
    || ![...fillEls.values()].every(isTruthy)
  ) {
    return alert('Expected HTML element missing');
  }

  const updateTuneText = throttle(500, (isClose: boolean, isTooLow: boolean) => {
    if (isClose) {
      tuneUpText.classList.remove('show');
      tuneDownText.classList.remove('show');
    } else {
      tuneUpText.classList[isTooLow ? 'add' : 'remove']('show');
      tuneDownText.classList[isTooLow ? 'remove' : 'add']('show');
    }
  });

  let audioContext: AudioContext;
  let analyser: AnalyserNode;
  let scriptProcessor: ScriptProcessorNode;
  let pitchDetector: Aubio.Pitch;
  let stream: MediaStream;
  let intervalId: number;

  matchCircleL.style.transform = `${translate.Y}(125%)`;

  const pauseCallback = () => {
    startEl.style.display = 'block';
    pauseEl.style.display = 'none';
    pressPlay.style.opacity = '1';
    pluckAString.style.opacity = '0';
    noteSpan.style.opacity = '0';
    noteSpan.style.color = '';
    matchCircleL.style.transform = `${translate.Y}(125%)`;
    tuneUpText.classList.remove('show');
    tuneDownText.classList.remove('show');
    updateTuneText(true);
    if ('animate' in Element.prototype) 
      startEl.animate([{ transform: 'translateY(10vw) scale(0.33)' }, { transform: 'translateY(0) scale(1)' }], { duration: 125, easing: 'ease' });
    else
      toggleClass(startEl, 'blob-animation');
  };

  pauseEl.addEventListener('click', async () => {
    clearInterval(intervalId);
    pauseCallback();
    await Promise.race([once(startEl, 'animationend'), timeout(250)]);

    scriptProcessor.disconnect(audioContext.destination);
    analyser.disconnect(scriptProcessor);
    audioContext.close();
    stream.getTracks().forEach(track => track.stop());
  });

  startEl.addEventListener('click', async () => {
    guitarTuner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    startEl.style.display = 'none';
    pauseEl.style.display = 'block';
    if ('animate' in Element.prototype)
      pauseEl.animate([{ transform: 'translateY(-10vw) scale(3) ' }, { transform: 'translateY(0) scale(1)' }], { duration: 125, easing: 'ease' });
    else 
      toggleClass(pauseEl, 'shrink-animation');

    await Promise.race([once(pauseEl, 'animationend'), timeout(250)]);

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    pitchDetector = new Pitch('default', BUFFER_SIZE, 1, audioContext.sampleRate);
    pitchDetector.setSilence(-60);

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioContext.createMediaStreamSource(stream).connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      pressPlay.style.opacity = '0';
      errorEl.style.opacity = '0';
      pluckAString.style.opacity = '1';

      // let prevCents = -50;
      // let prevNote = '';

      let resetable = false;
      let softResettable = false;
      let jinglePlayed = false;
      let lastNote: string | null = null;

      // const prevNotes: string[] = new Array(PREV_BUFFER_SIZE).fill(undefined);
      const noteBuffer: (string | undefined)[] = new Array(NOTE_BUFFER_SIZE).fill(undefined);

      let centsBufferMap: Map<string, number[]> = new Map(GUITAR_NOTES.map(nn => [nn, []]));

      // /** The last 3 notes including undefined. Used to reset the cents buffer between plucks of the string */
      // const pauseBuffer: string[] = new Array(PREV_BUFFER_SIZE).fill(undefined);

      const initialEvent = await once(scriptProcessor, 'audioprocess');
      const initialBuffer = initialEvent.inputBuffer.getChannelData(0);
      const initialFreq = pitchDetector.do(initialBuffer);

      const box: { frequency: number } = { frequency: initialFreq };
      scriptProcessor.addEventListener('audioprocess', event => {
        // console.timeEnd('audioprocess');
        // console.time('audioprocess');

        const buffer = event.inputBuffer.getChannelData(0);
        // volume = volumeAudioProcess(buffer);
        box.frequency = pitchDetector.do(buffer);
      });

      intervalId = setInterval(() => {
        // console.timeEnd('interval');
        // console.time('interval');

        const { frequency } = box;
        const note = getNote(frequency);

        queue(noteBuffer, note.name);

        // If there has been nothing but noise for the last couple of seconds, show the message again:
        const isNoise = [...groupedUntilChanged(noteBuffer.filter(isTruthy))].every(g => g.length <= 3);
        const groupedByNote = [...groupedUntilChanged(noteBuffer)][0];
        const isSilent = groupedByNote[0] === undefined && groupedByNote.length >= 2; // reset fill-up animation after two consecutive undefined values
        if (isNoise) {
          if (resetable) {
            resetable = false;
            pressPlay.style.opacity = '0';
            pluckAString.style.opacity = '1';
            noteSpan.style.opacity = '0';
            noteSpan.style.color = '';
            matchCircleL.style.transform = `${translate.Y}(125%)`;
            updateTuneText(true);
          }
        }
        else if (note.name && !Number.isNaN(note.cents)) {
          if (tunedJingle.paused) {
            resetable = true;
            softResettable = true;

            const noteName = `${note.name}_${note.octave}` as `${NoteString}_${Octave}` ;
            // const guitarNoteName = getClosestGuitarNoteByFreq(note.frequency);
            const guitarNoteName = getClosestGuitarNote(noteName);

            // console.log(note.frequency, noteName, guitarNoteName);

            // if (prevNote == note.name)
            // const degDiff = Math.trunc(Math.abs(prevDeg - deg));
            // prevDeg = deg;
            // const transformTime = (degDiff + 25) * 15;
            // console.log(noteName, note.cents)

            const foobar = GUITAR_FREQ[guitarNoteName];
            
            const isTooLow = frequency < foobar;

            const baseCents = noteName === guitarNoteName
              ? note.cents
              : isTooLow ? -50 : 50;

            const absCents100 = Math.abs(baseCents) * 2;
            const sensitivity = Math.min(10, Math.round(100 / absCents100));
            const centsUI = round(baseCents, sensitivity);

            const isClose = noteName === guitarNoteName && centsUI === 0;
            updateTuneText(isClose, isTooLow);

            // console.log(`${absCents2}/100 => %${sensitivity} => ${Math.abs(centsApprox) * 2}/100`);
            // const centsApprox = note.cents;
            // console.log(centsApprox)

            // const transitionTime = 200 + Math.abs(prevCents - centsApprox) * 10;
            // console.log(transitionTime)

            // matchCircleR.style.transform = `translateY(${note.cents}%)`;
            pluckAString.style.opacity = '0';
            noteSpan.style.opacity = '1';
            const gnn = guitarNoteName.split('_')[0];
            if (lastNote !== gnn) { noteSpan.innerText = gnn }
            lastNote = gnn;

            const centsBuffer = centsBufferMap.get(noteName) ?? [];
            if (noteName === guitarNoteName && centsUI === 0) centsBuffer.push(0);

            const tuneRatio = clamp(centsBuffer.length / TUNE_BUFFER_SIZE); // skip 1 entry to allow animation to complete
            // console.log(noteName, tuneRatio)
            innerCircle.style.transition = `transform ${ANIM_DURATION}ms ease`
            innerCircle.style.transform = `scale(${1 - tuneRatio})`;

            noteSpan.style.transition = `color ${ANIM_DURATION}ms ease`
            noteSpan.style.color = tuneRatio === 1 ? '#fff' : '#fff8';

            matchCircleL.style.transition = `transform ${ANIM_DURATION}ms ease`;
            matchCircleL.style.transform = `${translate.Y}(${-centsUI}%)`;

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

          // queue(prevNotes, note.name);
        }
        else if (softResettable && isSilent) {
          // console.log('soft reset');
          innerCircle.style.transition = 'transform 100ms'
          innerCircle.style.transform = `scale(1)`;
          softResettable = false;
          jinglePlayed = false;
          centsBufferMap = new Map(GUITAR_NOTES.map(nn => [nn, []]));
        }

        // // console.log(pauseBuffer)
        // queue(pauseBuffer, note.name);
      }, INTERVAL_TIME);
    } catch (err) {
      clearInterval(intervalId);
      pauseCallback();
      pressPlay.style.opacity = '0';
      errorEl.innerText = err.message;
      errorEl.style.opacity = '1';
    };
  });
});
