export function drawWaveform(canvas, buffer) {
  if (!canvas || !buffer) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const { width, height } = canvas;
  ctx2d.clearRect(0, 0, width, height);
  ctx2d.fillStyle = '#1f2a3a';
  ctx2d.fillRect(0, 0, width, height);
  ctx2d.strokeStyle = '#6ab8ff';
  ctx2d.lineWidth = 1;
  const channel = buffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channel.length / width));
  ctx2d.beginPath();
  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    const end = Math.min(channel.length, start + samplesPerPixel);
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const value = channel[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const y1 = ((1 + min) / 2) * height;
    const y2 = ((1 + max) / 2) * height;
    ctx2d.moveTo(x + 0.5, y1);
    ctx2d.lineTo(x + 0.5, y2);
  }
  ctx2d.stroke();
}
