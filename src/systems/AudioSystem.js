// Âm thanh tổng hợp bằng Web Audio API (không dùng tệp âm thanh có bản quyền).
// Có nhánh MediaStreamDestination để ghi âm thanh vào video.

// âm thanh của khán giả — tắt cùng tùy chọn "Khán giả"
const CROWD_SFX = new Set(['crowdOh', 'crowdCheer', 'crowdAww', 'applause', 'whoosh', 'splat', 'bonk', 'pop', 'boing', 'plop', 'nom', 'sprinkle', 'whistle']);

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = false;
    this.lastPlay = {};
    this.voiceWindow = [];
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.crowdHype = 0; // độ hưng phấn của khán giả (0..1) — điều khiển tiếng ồn nền
    this.crowdOn = true; // tắt tùy chọn "Khán giả" → im tiếng đám đông
  }

  /** Phải gọi trong một thao tác người dùng (click) để trình duyệt cho phép phát âm thanh. */
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.recordDest);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.18;
      this.musicGain.connect(this.master);
      this.noiseBuf = this.makeNoise();
      this.startMurmur();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.musicOn) this.startMusic();
  }

  get recordStream() {
    return this.recordDest ? this.recordDest.stream : null;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setSfx(on) {
    this.sfxOn = on;
    this.setCrowdLevel();
  }

  setCrowd(on) {
    this.crowdOn = on;
    this.setCrowdLevel();
  }

  // ---------- khán giả ----------
  /** Tiếng ồn nền đám đông: nhiễu lọc dải giọng nói, to nhỏ theo độ hưng phấn. */
  startMurmur() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // nhiễu "nhấp nhô" (nhiều tiếng nói chồng lên nhau) thay vì xì đều
    let env = 0;
    for (let i = 0; i < len; i++) {
      if (i % 2400 === 0) env = 0.4 + Math.random() * 0.6;
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    this.murmur = ctx.createGain();
    this.murmur.gain.value = 0;
    src.connect(bp).connect(lp).connect(this.murmur).connect(this.sfxGain);
    src.start();
    this.setCrowdLevel();
  }

  /** Đặt lại âm lượng tiếng ồn nền: dâng lên theo crowdHype rồi lắng dần. */
  setCrowdLevel() {
    if (!this.murmur) return;
    const now = this.ctx.currentTime;
    const g = this.murmur.gain;
    const base = this.sfxOn && this.crowdOn ? 0.07 : 0;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(base * (1 + 2.5 * this.crowdHype), now, 0.15);
    g.setTargetAtTime(base, now + 0.6, 2.5);
  }

  hype(amount) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const cool = Math.exp(-(now - (this.hypeAt ?? now)) / 4); // nguội dần sau ~4 giây yên ắng
    this.hypeAt = now;
    this.crowdHype = Math.min(1, this.crowdHype * cool + amount);
    this.setCrowdLevel();
  }

  /**
   * Một tiếng hô của đám đông: nhiều giọng (sawtooth lệch tông) qua 2 bộ lọc formant của nguyên âm.
   * glide: hệ số tông cuối so với tông đầu (>1 = lên giọng "ồ!", <1 = xuống giọng "aaa…").
   */
  crowdVoice({ f0 = 220, glide = 1, formants = [500, 900], dur = 0.9, vol = 0.12, voices = 9, t0 = this.ctx.currentTime }) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    this.env(out, t0, dur * 0.25, vol, dur * 0.75);
    const filters = formants.map((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 5;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0.6;
      bp.connect(g).connect(out);
      return bp;
    });
    out.connect(this.sfxGain);
    for (let v = 0; v < voices; v++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = f0 * (0.75 + Math.random() * 0.6); // giọng nam, nữ, trẻ con lẫn lộn
      const st = t0 + Math.random() * 0.08;
      o.frequency.setValueAtTime(f, st);
      o.frequency.exponentialRampToValueAtTime(f * glide, st + dur);
      o.detune.value = (Math.random() - 0.5) * 40;
      for (const bp of filters) o.connect(bp);
      o.start(st);
      o.stop(st + dur + 0.1);
    }
  }

  /** Tràng pháo tay: nhiều tiếng vỗ ngắn rải ngẫu nhiên. */
  applause(dur = 3, vol = 0.35) {
    const t0 = this.ctx.currentTime;
    const n = Math.round(dur * 70);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.random() * dur;
      const fade = 1 - (t - t0) / dur; // thưa dần về cuối
      if (Math.random() > 0.35 + 0.65 * fade) continue;
      this.noise(0.03, vol * (0.4 + Math.random() * 0.6), 'bandpass', 1200 + Math.random() * 1600, null, 1.4, t);
    }
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  /** Giới hạn số âm phát đồng thời khi có nhiều cá. */
  allow(type, minGap) {
    const now = this.ctx.currentTime;
    if (this.lastPlay[type] !== undefined && now - this.lastPlay[type] < minGap) return false;
    this.voiceWindow = this.voiceWindow.filter((t) => now - t < 0.12);
    if (this.voiceWindow.length > 8) return false;
    this.voiceWindow.push(now);
    this.lastPlay[type] = now;
    return true;
  }

  env(node, t0, attack, peak, decay) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  tone(type, freq, freqEnd, dur, vol, t0 = this.ctx.currentTime, dest = this.sfxGain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    this.env(g, t0, 0.005, vol, dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise(dur, vol, filterType, f0, f1, q = 1, t0 = this.ctx.currentTime) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t0);
    if (f1) filt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, t0, 0.004, vol, dur);
    src.connect(filt).connect(g).connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  play(type, opts = {}) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    if (!this.crowdOn && CROWD_SFX.has(type)) return;
    const r = 0.9 + Math.random() * 0.2;
    switch (type) {
      case 'slash': // tiếng kiếm chém
        if (!this.allow(type, 0.05)) return;
        this.noise(0.14, 0.5, 'bandpass', 2400 * r, 900, 2.5);
        break;
      case 'hit': // đòn đánh trúng
        if (!this.allow(type, 0.04)) return;
        this.tone('triangle', 180 * r, 60, 0.16, 0.6);
        this.noise(0.08, 0.35, 'lowpass', 1800, 400);
        break;
      case 'clash': // kim loại va chạm
        if (!this.allow(type, 0.05)) return;
        for (const f of [1870, 2530, 3310]) this.tone('square', f * r, f * r * 0.98, 0.18, 0.07);
        this.noise(0.05, 0.25, 'highpass', 4000);
        break;
      case 'zap': // tiếng điện
        if (!this.allow(type, 0.08)) return;
        this.tone('sawtooth', 90 * r, 900, 0.22, 0.22);
        this.noise(0.22, 0.25, 'bandpass', 3000, 6000, 4);
        break;
      case 'death': // bị loại
        if (!this.allow(type, 0.06)) return;
        this.tone('square', 520 * r, 70, 0.45, 0.25);
        this.noise(0.3, 0.3, 'lowpass', 1200, 200);
        break;
      case 'levelup': {
        if (!this.allow(type, 0.15)) return;
        const t0 = this.ctx.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, null, 0.18, 0.3, t0 + i * 0.07));
        break;
      }
      case 'victory': {
        const t0 = this.ctx.currentTime;
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('square', f, null, i === 5 ? 0.7 : 0.16, 0.2, t0 + i * 0.13));
        [262, 330, 392].forEach((f) => this.tone('triangle', f, null, 1.2, 0.18, t0 + 0.65));
        break;
      }
      case 'appear': {
        // tiếng "vụt" luồng sáng + chuông ngân
        const t0 = this.ctx.currentTime;
        this.noise(0.35, 0.25, 'bandpass', 600, 5000, 1.5, t0);
        this.tone('triangle', 660 * r, 1320 * r, 0.3, 0.22, t0 + 0.05);
        this.tone('sine', 1320 * r, null, 0.5, 0.12, t0 + 0.12);
        break;
      }
      case 'ultimate': {
        // tụ lực (quét tần số lên) rồi nổ trầm
        const t0 = this.ctx.currentTime;
        this.tone('sawtooth', 180, 1400, 0.35, 0.22, t0);
        this.noise(0.35, 0.2, 'bandpass', 400, 4000, 2, t0);
        this.tone('sine', 90, 40, 0.7, 0.5, t0 + 0.32);
        this.noise(0.5, 0.45, 'lowpass', 1600, 150, 1, t0 + 0.32);
        [523, 784, 1047].forEach((f, i) => this.tone('triangle', f, null, 0.4, 0.12, t0 + 0.34 + i * 0.05));
        break;
      }
      case 'fight': {
        // "CHIẾN!": cồng trầm + hợp âm
        const t0 = this.ctx.currentTime;
        this.tone('sawtooth', 110, 70, 0.9, 0.35, t0);
        this.noise(0.6, 0.4, 'lowpass', 900, 120, 1, t0);
        [392, 523, 659].forEach((f) => this.tone('square', f, null, 0.45, 0.12, t0 + 0.05));
        break;
      }
      case 'wall':
        if (!this.allow(type, 0.12)) return;
        this.tone('sine', 140 * r, 90, 0.08, 0.15);
        break;
      case 'crowdOh': // "Ồ!" khi có đòn mạnh
        if (!this.allow(type, 1.2)) return;
        this.crowdVoice({ f0: 200 * r, glide: 1.35, formants: [450, 800], dur: 0.8, vol: 0.13 });
        break;
      case 'crowdCheer': // hò reo khi tung tuyệt chiêu / hạ gục
        if (!this.allow(type, 0.9)) return;
        this.crowdVoice({ f0: 260 * r, glide: 1.15, formants: [650, 1700], dur: 1.4, vol: 0.14, voices: 12 });
        this.noise(1.2, 0.18, 'bandpass', 1500, 2600, 0.8);
        break;
      case 'crowdAww': // "Aaa…" tiếc nuối khi một con bị loại
        if (!this.allow(type, 1.5)) return;
        this.crowdVoice({ f0: 240 * r, glide: 0.62, formants: [750, 1150], dur: 1.2, vol: 0.12 });
        break;
      case 'applause':
        if (!this.allow(type, 2)) return;
        this.applause(opts.dur || 3.5);
        this.crowdVoice({ f0: 270, glide: 1.2, formants: [650, 1700], dur: 2.2, vol: 0.15, voices: 14 });
        break;
      case 'whoosh': // đồ vật bay từ khán đài
        if (!this.allow(type, 0.1)) return;
        this.noise(0.45, 0.16, 'bandpass', 500, 2400, 3);
        break;
      case 'splat': // cà chua nát bét
        if (!this.allow(type, 0.08)) return;
        this.noise(0.22, 0.5, 'lowpass', 900 * r, 150);
        this.tone('sine', 120 * r, 45, 0.16, 0.45);
        break;
      case 'pop': // bóng bay nổ
        if (!this.allow(type, 0.1)) return;
        this.noise(0.12, 0.7, 'highpass', 900);
        this.tone('sine', 300 * r, 80, 0.1, 0.4);
        break;
      case 'boing': // phao / cua nảy
        if (!this.allow(type, 0.15)) return;
        this.tone('sine', 180 * r, 520 * r, 0.25, 0.3);
        this.tone('triangle', 360 * r, 900 * r, 0.2, 0.1);
        break;
      case 'plop': // phao rơi xuống sàn
        if (!this.allow(type, 0.1)) return;
        this.tone('sine', 420 * r, 120, 0.14, 0.35);
        break;
      case 'nom': // cá đớp hạt thức ăn
        if (!this.allow(type, 0.09)) return;
        this.tone('square', 700 * r, 1100 * r, 0.05, 0.06);
        break;
      case 'sprinkle': // rải hạt
        if (!this.allow(type, 0.3)) return;
        for (let i = 0; i < 10; i++) this.noise(0.02, 0.12, 'highpass', 5000, null, 1, this.ctx.currentTime + i * 0.035);
        break;
      case 'whistle': { // còi bảo vệ
        if (!this.allow(type, 0.5)) return;
        const t0 = this.ctx.currentTime;
        this.tone('sine', 2600, 2700, 0.18, 0.18, t0);
        this.tone('sine', 2600, 2750, 0.45, 0.2, t0 + 0.24);
        break;
      }
      case 'bonk': // cờ lê cốc vào đầu
        if (!this.allow(type, 0.08)) return;
        this.tone('triangle', 620 * r, 300, 0.22, 0.35);
        for (const f of [1320, 2150]) this.tone('sine', f * r, f * r * 0.97, 0.35, 0.08);
        break;
      default:
        break;
    }
  }

  onEvent(e) {
    switch (e.type) {
      case 'hit':
        if ((e.dmg || 0) >= 22) this.play('crowdOh');
        this.hype(Math.min(0.12, (e.dmg || 0) / 180));
        if (e.kind === 'electric') this.play('zap');
        else if (e.weapon === 'sword' || e.weapon === 'blades' || e.weapon === 'spear') {
          this.play('slash');
          this.play('hit');
        } else this.play('hit');
        break;
      case 'clash':
        this.play('clash');
        break;
      case 'discharge':
        this.play('zap');
        break;
      case 'death':
        this.play('death');
        this.play('crowdAww');
        this.hype(0.3);
        break;
      case 'ultimate':
        this.play('crowdCheer');
        this.hype(0.4);
        break;
      case 'levelup':
        this.play('levelup');
        break;
      case 'victory':
        this.play('victory');
        this.play('applause');
        this.hype(1);
        break;
      default:
        break;
    }
  }

  // Nhạc nền đơn giản tự tạo (bass + arpeggio), lên lịch trước bằng đồng hồ AudioContext.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicStep = 0;
    const tempo = 0.16;
    const bass = [110, 110, 131, 131, 98, 98, 147, 131];
    const arp = [0, 4, 7, 12, 7, 4];
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.3) {
        const s = this.musicStep;
        const root = bass[Math.floor(s / 8) % bass.length];
        if (s % 2 === 0) this.tone('triangle', root, null, tempo * 1.6, 0.5, this.nextNoteTime, this.musicGain);
        const semis = arp[s % arp.length];
        this.tone('square', root * 4 * Math.pow(2, semis / 12), null, tempo * 0.8, 0.12, this.nextNoteTime, this.musicGain);
        this.nextNoteTime += tempo;
        this.musicStep++;
      }
    }, 60);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}

export const audio = new AudioSystem();
