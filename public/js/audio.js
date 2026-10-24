/**
 * SloanAI Ambient Soundscape Engine
 * 100% Procedural Web Audio API Sound Synthesizer.
 * Synthesizes calming acoustic soundscapes entirely through code in real-time,
 * without streaming any audio files or requiring an internet connection.
 */

class SoundscapeEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.timerId = null;
    this.timerRemaining = 0;

    // Track channels
    this.channels = {
      rain: { gain: null, node: null, volume: 0.4 },
      binaural: { gain: null, nodes: [], volume: 0.25 },
      wind: { gain: null, node: null, volume: 0.3 },
      vinyl: { gain: null, node: null, volume: 0.2 }
    };
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Initialize Channels
    this.setupRain();
    this.setupBinaural();
    this.setupWind();
    this.setupVinyl();
  }

  // Generate pink/brown noise buffer for natural acoustic textures
  createNoiseBuffer(type = 'pink') {
    const bufferSize = 5 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;

      if (type === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else if (type === 'brown') {
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
    }
    return buffer;
  }

  // 1. Rain Synthesizer
  setupRain() {
    const rainGain = this.ctx.createGain();
    rainGain.gain.setValueAtTime(0, this.ctx.currentTime);

    const noiseBuffer = this.createNoiseBuffer('pink');
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Filter to simulate soft raindrops on leaves
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(this.masterGain);

    noiseSource.start();
    this.channels.rain.gain = rainGain;
    this.channels.rain.node = noiseSource;
  }

  // 2. Binaural Beats Synthesizer (Theta waves ~6Hz for deep calm & slow sleep)
  setupBinaural() {
    const binGain = this.ctx.createGain();
    binGain.gain.setValueAtTime(0, this.ctx.currentTime);

    const baseFreq = 216; // Hz
    const beatFreq = 6;   // 6 Hz theta rhythm

    // Left Ear
    const oscLeft = this.ctx.createOscillator();
    oscLeft.type = 'sine';
    oscLeft.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);

    const panLeft = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panLeft) panLeft.pan.setValueAtTime(-1, this.ctx.currentTime);

    // Right Ear
    const oscRight = this.ctx.createOscillator();
    oscRight.type = 'sine';
    oscRight.frequency.setValueAtTime(baseFreq + beatFreq, this.ctx.currentTime);

    const panRight = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panRight) panRight.pan.setValueAtTime(1, this.ctx.currentTime);

    if (panLeft && panRight) {
      oscLeft.connect(panLeft);
      panLeft.connect(binGain);

      oscRight.connect(panRight);
      panRight.connect(binGain);
    } else {
      oscLeft.connect(binGain);
      oscRight.connect(binGain);
    }

    binGain.connect(this.masterGain);

    oscLeft.start();
    oscRight.start();

    this.channels.binaural.gain = binGain;
    this.channels.binaural.nodes = [oscLeft, oscRight];
  }

  // 3. Twilight Wind & Ambient Chimes Synthesizer
  setupWind() {
    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0, this.ctx.currentTime);

    const noiseBuffer = this.createNoiseBuffer('brown');
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Resonant sweep filter for gusting breeze
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    // LFO for slow breathing wind movement
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime); // 8-second cycle
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(180, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    noiseSource.connect(filter);
    filter.connect(windGain);
    windGain.connect(this.masterGain);

    noiseSource.start();
    this.channels.wind.gain = windGain;
    this.channels.wind.node = noiseSource;

    // Periodic gentle chime ping
    this.startChimeLoop(windGain);
  }

  startChimeLoop(destinationGain) {
    const pentatonicFrequencies = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
    
    const triggerChime = () => {
      if (!this.isPlaying) return;
      if (this.channels.wind.volume > 0.05) {
        const freq = pentatonicFrequencies[Math.floor(Math.random() * pentatonicFrequencies.length)];
        const osc = this.ctx.createOscillator();
        const chimeGain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        const now = this.ctx.currentTime;
        chimeGain.gain.setValueAtTime(0, now);
        chimeGain.gain.linearRampToValueAtTime(0.08, now + 0.04);
        chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);

        osc.connect(chimeGain);
        chimeGain.connect(destinationGain);

        osc.start(now);
        osc.stop(now + 3.6);
      }

      // Schedule next chime randomly between 4 and 10 seconds
      const nextDelay = 4000 + Math.random() * 6000;
      setTimeout(triggerChime, nextDelay);
    };

    setTimeout(triggerChime, 3000);
  }

  // 4. Lo-Fi Vinyl Crackle Synthesizer
  setupVinyl() {
    const vinylGain = this.ctx.createGain();
    vinylGain.gain.setValueAtTime(0, this.ctx.currentTime);

    // Filtered noise with stochastic impulse pops
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // 99.8% subtle hum, 0.2% randomized vinyl crackles
      if (Math.random() > 0.9982) {
        data[i] = (Math.random() * 2 - 1) * 0.9;
      } else {
        data[i] = (Math.random() * 2 - 1) * 0.02;
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2500, this.ctx.currentTime);

    source.connect(filter);
    filter.connect(vinylGain);
    vinylGain.connect(this.masterGain);

    source.start();
    this.channels.vinyl.gain = vinylGain;
    this.channels.vinyl.node = source;
  }

  // Play / Pause Master
  togglePlay() {
    this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isPlaying = !this.isPlaying;
    const now = this.ctx.currentTime;

    if (this.isPlaying) {
      Object.keys(this.channels).forEach(name => {
        const ch = this.channels[name];
        if (ch.gain) {
          ch.gain.gain.cancelScheduledValues(now);
          ch.gain.gain.linearRampToValueAtTime(ch.volume, now + 1.2);
        }
      });
    } else {
      Object.keys(this.channels).forEach(name => {
        const ch = this.channels[name];
        if (ch.gain) {
          ch.gain.gain.cancelScheduledValues(now);
          ch.gain.gain.linearRampToValueAtTime(0, now + 0.8);
        }
      });
    }

    return this.isPlaying;
  }

  // Set individual channel volume (0.0 to 1.0)
  setChannelVolume(channelName, vol) {
    if (!this.channels[channelName]) return;
    this.channels[channelName].volume = vol;
    if (this.isPlaying && this.channels[channelName].gain) {
      const now = this.ctx.currentTime;
      this.channels[channelName].gain.gain.cancelScheduledValues(now);
      this.channels[channelName].gain.gain.linearRampToValueAtTime(vol, now + 0.2);
    }
  }

  // Apply Pre-configured Soundscape Presets
  applyPreset(presetName) {
    const presets = {
      rainforest: { rain: 0.7, binaural: 0.15, wind: 0.4, vinyl: 0.05 },
      lofi: { rain: 0.25, binaural: 0.1, wind: 0.1, vinyl: 0.6 },
      slumber: { rain: 0.1, binaural: 0.6, wind: 0.35, vinyl: 0.0 },
      forestBreeze: { rain: 0.3, binaural: 0.2, wind: 0.7, vinyl: 0.1 }
    };

    const target = presets[presetName] || presets.rainforest;
    Object.keys(target).forEach(ch => {
      this.setChannelVolume(ch, target[ch]);
    });

    return target;
  }

  // Sleep Timer with Gentle Exponential Fadeout
  setSleepTimer(minutes, onTick, onComplete) {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (minutes <= 0) {
      this.timerRemaining = 0;
      if (onTick) onTick(0);
      return;
    }

    this.timerRemaining = minutes * 60;
    if (onTick) onTick(this.timerRemaining);

    this.timerId = setInterval(() => {
      this.timerRemaining--;
      if (onTick) onTick(this.timerRemaining);

      // Start fade out in the last 15 seconds
      if (this.timerRemaining <= 15 && this.timerRemaining > 0 && this.masterGain) {
        const now = this.ctx.currentTime;
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(0.001, now + 15);
      }

      if (this.timerRemaining <= 0) {
        clearInterval(this.timerId);
        this.timerId = null;
        if (this.isPlaying) this.togglePlay();
        if (onComplete) onComplete();
      }
    }, 1000);
  }
}

// Global singleton instance
window.soundscapeEngine = new SoundscapeEngine();
