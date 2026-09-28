export function audioAlert(): void {
  try {
    const context = new AudioContext();
    const start = context.currentTime;
    for (let offset = 0; offset < 10; offset += 0.8) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = offset % 1.6 < 0.8 ? 880 : 660;
      gain.gain.setValueAtTime(0.001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.42, start + offset + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.32);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.35);
    }
    setTimeout(() => void context.close(), 10500);
  } catch {
    /* Browser audio may require a gesture. */
  }
}