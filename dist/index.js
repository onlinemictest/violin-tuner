"use strict";
/**
 * Copyright (C) 2020 Online Mic Test
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
 */console.log("Licensed under AGPL-3.0: https://github.com/onlinemictest/pitch-detector");const e=Math.pow(2,12),t=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],n=["E_4","B_3","G_3","D_3","A_2","E_2"],o=(e,...t)=>{e.classList.remove(...t),e.offsetWidth,e.classList.add(...t)};function i(e){const n=function(e){const t=Math.log(e/440)/Math.log(2)*12;return Math.round(t)+69}(e);return{value:n%12,index:n,name:t[n%12],cents:a(e,n),octave:Math.trunc(n/12)-1,frequency:e}}function a(e,t){return Math.floor(1200*Math.log(e/function(e){return 440*Math.pow(2,(e-69)/12)}(t))/Math.log(2))}Aubio().then((({Pitch:t})=>{if(function(){if(window.AudioContext=window.AudioContext||window.webkitAudioContext,!window.AudioContext)return alert("AudioContext not supported");void 0===navigator.mediaDevices&&(navigator.mediaDevices={}),void 0===navigator.mediaDevices.getUserMedia&&(navigator.mediaDevices.getUserMedia=function(e){const t=navigator.webkitGetUserMedia||navigator.mozGetUserMedia;return t||alert("getUserMedia is not implemented in this browser"),new Promise((function(n,o){t.call(navigator,e,n,o)}))})}(),!("WebAssembly"in window&&"AudioContext"in window&&"createAnalyser"in AudioContext.prototype&&"createScriptProcessor"in AudioContext.prototype&&"trunc"in Math))return alert("Browser not supported");const a=document.getElementById("audio-start"),s=document.getElementById("audio-pause"),r=document.getElementById("match-circle-r"),c=document.getElementById("match-circle-l");let d,l,u,m;const f=r.innerText;s.addEventListener("click",(()=>{u.disconnect(d.destination),l.disconnect(u),d.close(),a.style.display="block",s.style.display="none",c.style.transform="translateX(-30vw)",r.innerText=f,r.classList.add("with-text"),r.style.color="",o(a,"blob-animation")})),a.addEventListener("click",(()=>{d=new AudioContext,l=d.createAnalyser(),u=d.createScriptProcessor(e,1,1),m=new t("default",e,1,d.sampleRate),m.setSilence(-70),navigator.mediaDevices.getUserMedia({audio:!0}).then((e=>{d.createMediaStreamSource(e).connect(l),l.connect(u),u.connect(d.destination),a.style.display="none",s.style.display="block",r.innerText="",r.classList.remove("with-text"),o(s,"shrink-animation"),c.style.visibility="visible";let t=new Array(3);u.addEventListener("audioprocess",(e=>{const o=e.inputBuffer.getChannelData(0),a=(function(e){let t,n=e.length,o=0;for(let i=0;i<n;i++)t=e[i],o+=t*t;Math.sqrt(o/n)}(o),i(m.do(o)));if(!a.name)return;const s=`${a.name}_${a.octave}`;if(n.includes(s)){if(t.every((e=>e===a.name))&&!Number.isNaN(a.cents)){console.log(a);const e=((e,t=1)=>Math.round(e/t)*t)(a.cents,5);console.log(e),c.style.transition="transform 200ms ease",c.style.transform=`translateX(${-e}%)`,r.innerText=a.name,r.style.color=0===e?"#fff":"#fff8"}t.pop(),t.unshift(a.name)}}))}))}))}));
//# sourceMappingURL=index.js.map
