
// --- Audio setup using Web Audio API ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let currentStep = 0;
let isPlaying = false;
let intervalId;

// Simple function to trigger a sound
function playClick() {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "square";          // waveform type
  osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 tone
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);     // volume

  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1); // short blip
}

// --- Sequencer grid setup ---
const sequencer = document.getElementById("sequencer");
const steps = [];

// Create 16 step buttons
for (let i = 0; i < 16; i++) {
  const step = document.createElement("div");
  step.classList.add("step");
  step.dataset.index = i;

  // Toggle active state on click
  step.addEventListener("click", () => {
    step.classList.toggle("active");
  });

  sequencer.appendChild(step);
  steps.push(step);
}

// --- Transport functions ---
function play() {
  if (isPlaying) return;
  isPlaying = true;
  currentStep = 0;

  // Step through sequencer at 120 BPM (500ms per beat)
  intervalId = setInterval(() => {
    steps.forEach((s, i) => {
      // Highlight current step
      s.style.outline = i === currentStep ? "2px solid red" : "none";

      // Play sound if step is active
      if (i === currentStep && s.classList.contains("active")) {
        playClick();
      }
    });

    currentStep = (currentStep + 1) % steps.length;
  }, 500);
}

function stop() {
  isPlaying = false;
  clearInterval(intervalId);

  // Clear step highlights
  steps.forEach((s) => (s.style.outline = "none"));
}

// --- Wire up transport buttons ---
document.getElementById("play").addEventListener("click", play);
document.getElementById("stop").addEventListener("click", stop);
