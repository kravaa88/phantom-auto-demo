export function offerGarageSound(button) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  let audio;
  let current;
  button.hidden = false;
  button.addEventListener('click', async () => {
    if (current) {
      current.stop();
      current = undefined;
      button.textContent = 'Play garage sound';
      return;
    }
    try {
      audio ??= new AudioContext();
      await audio.resume();
      if (current) return;
      const start = audio.currentTime;
      const engine = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      const volume = audio.createGain();
      engine.type = 'triangle';
      engine.frequency.setValueAtTime(40, start);
      engine.frequency.exponentialRampToValueAtTime(86, start + 0.65);
      engine.frequency.exponentialRampToValueAtTime(34, start + 1.8);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(185, start);
      volume.gain.setValueAtTime(0, start);
      volume.gain.linearRampToValueAtTime(0.16, start + 0.35);
      volume.gain.exponentialRampToValueAtTime(0.001, start + 1.8);
      engine.connect(filter).connect(volume).connect(audio.destination);
      engine.onended = () => {
        engine.disconnect();
        filter.disconnect();
        volume.disconnect();
        if (current === engine) {
          current = undefined;
          button.textContent = 'Play garage sound';
        }
      };
      current = engine;
      engine.start();
      engine.stop(start + 1.85);
      button.textContent = 'Stop sound';
    } catch {
      button.hidden = true;
    }
  });
}
