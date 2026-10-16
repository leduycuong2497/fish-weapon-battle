import { DEFAULT_SETTINGS, LIMITS, SIM_DT, SPECIES, SPEED_STEPS } from './config.js';
import { Simulation, buildRoster } from './sim/Simulation.js';
import { randomSeedString } from './sim/rng.js';
import { recordMatch } from './systems/BattleStatistics.js';
import { audio } from './systems/AudioSystem.js';
import { RecordingSystem, detectRecordingSupport } from './systems/RecordingSystem.js';

const SETTINGS_KEY = 'fwb.settings.v1';
const MAX_STEPS_PER_FRAME = 20;
const UNTIL_END_MAX = 90;

function cloneDefaults() {
  return structuredClone(DEFAULT_SETTINGS);
}

/**
 * Trạng thái ứng dụng: idle → ready (đã tạo trận) → running ⇄ paused → victory → over.
 */
export class GameController {
  constructor() {
    this.listeners = {};
    this.settings = this.loadSettings();
    this.sim = null;
    this.state = 'idle';
    this.lastMatch = null; // { settings, seed }
    this.acc = 0;
    this.victoryAt = -1;
    this.statsTimer = 0;
    this.layout = 'normal';
    this.recorder = new RecordingSystem();
    this.recording = null; // { duration, startedSimOver }
    this.scene = null;
  }

  on(evt, cb) {
    (this.listeners[evt] ||= []).push(cb);
  }

  emit(evt, data) {
    for (const cb of this.listeners[evt] || []) cb(data);
  }

  // ---------- cấu hình ----------
  loadSettings() {
    const s = cloneDefaults();
    try {
      const saved = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        for (const k of Object.keys(s)) {
          if (saved[k] === undefined) continue;
          if (typeof s[k] === 'object') Object.assign(s[k], saved[k]);
          else s[k] = saved[k];
        }
      }
    } catch {
      /* bỏ qua cấu hình hỏng */
    }
    return s;
  }

  saveSettings() {
    try {
      globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* bỏ qua */
    }
  }

  updateSettings(patch) {
    Object.assign(this.settings, patch);
    this.saveSettings();
    if ('sfx' in patch) audio.setSfx(this.settings.sfx);
    if ('crowd' in patch) audio.setCrowd(this.settings.crowd !== false);
    if ('music' in patch) audio.setMusic(this.settings.music);
    this.emit('settings', this.settings);
  }

  resetSettings() {
    this.settings = cloneDefaults();
    this.saveSettings();
    audio.setSfx(this.settings.sfx);
    audio.setCrowd(this.settings.crowd !== false);
    audio.setMusic(this.settings.music);
    this.emit('settings', this.settings);
    this.toast('Đã đặt lại cấu hình mặc định.');
  }

  /** Chia đều tổng số cá cho các loài đang bật. */
  distributeTotal(total) {
    const ids = SPECIES.filter((s) => this.settings.enabled[s.id]).map((s) => s.id);
    total = Math.max(LIMITS.minFish, Math.min(LIMITS.maxFish, Math.round(total)));
    const counts = Object.fromEntries(SPECIES.map((s) => [s.id, 0]));
    if (ids.length) {
      for (let i = 0; i < total; i++) counts[ids[i % ids.length]]++;
    }
    this.settings.counts = counts;
    this.settings.totalFish = total;
    this.saveSettings();
    this.emit('settings', this.settings);
  }

  rosterSize(settings = this.settings) {
    return buildRoster(settings).length;
  }

  // ---------- trận đấu ----------
  createMatch({ seed, settings } = {}) {
    const s = structuredClone(settings || this.settings);
    const useSeed = seed || (s.seed && s.seed.trim()) || randomSeedString();
    try {
      this.sim = new Simulation(s, useSeed);
    } catch (err) {
      this.toast(err.message, 'error');
      return null;
    }
    this.lastMatch = { settings: s, seed: useSeed };
    this.state = 'ready';
    this.acc = 0;
    this.victoryAt = -1;
    this.intro = null;
    this.slowUntil = 0;
    this.emit('match', this.sim);
    this.emitState();
    this.emitStats(true);
    return this.sim;
  }

  start() {
    audio.unlock();
    if (!this.sim || this.state === 'over' || this.state === 'victory') {
      if (!this.createMatch()) return;
    }
    if (this.state === 'ready' && this.settings.intro !== false) {
      this.beginIntro();
      return;
    }
    if (this.state === 'ready' || this.state === 'paused') {
      this.state = 'running';
      this.emitState();
    }
  }

  /**
   * Màn ra mắt: từng con cá lần lượt xuất hiện dưới luồng sáng, rồi "CHIẾN!".
   * Mô phỏng chưa chạy trong lúc này (không ảnh hưởng kết quả hay tái tạo seed).
   */
  beginIntro() {
    const n = this.sim.fish.length;
    const stagger = Math.min(0.42, 2.2 / n);
    // kiểu giới thiệu: 'cards' = màn "Cuộc đối đầu nảy lửa" (~3 s) + thẻ từng chiến binh (~3 s/loài);
    // 'jumbotron' = camera bay tới màn hình lớn (~2,6 s) + từng loài trên màn hình (~2,6 s/loài) + bay về (~1,6 s)
    const species = [...new Set(this.sim.fish.map((f) => f.speciesId))];
    const style = this.settings.introStyle || (this.settings.presentation === false ? 'off' : 'cards');
    const jumbo = style === 'jumbotron';
    const on = style !== 'off';
    const title = !on ? 0 : jumbo ? 2.6 : 3;
    const card = !on ? 0 : jumbo ? 2.6 : 3;
    const flyOut = jumbo ? 1.6 : 0;
    const present = title + card * species.length + flyOut;
    this.intro = {
      start: performance.now(),
      style,
      present,
      title,
      card,
      flyOut,
      species,
      stagger,
      appearEnd: present + stagger * n + 0.35,
      duration: present + stagger * n + 1.15,
    };
    this.state = 'intro';
    this.emitState();
  }

  /** Chậm động tác trong ms (dùng cho tuyệt chiêu). */
  slowMotion(ms, factor = 0.3, replace = false) {
    const until = performance.now() + ms;
    this.slowUntil = replace ? until : Math.max(this.slowUntil || 0, until);
    this.slowFactor = factor;
  }

  /** Thời gian (giây) đã trôi qua của màn ra mắt, hoặc null. */
  introElapsed() {
    return this.intro ? (performance.now() - this.intro.start) / 1000 : null;
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.emitState();
  }

  resume() {
    audio.unlock();
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.emitState();
  }

  /** CHẠY LẠI: cùng cấu hình trận trước, seed mới. */
  runAgain() {
    audio.unlock();
    const base = this.lastMatch ? this.lastMatch.settings : this.settings;
    if (this.createMatch({ settings: base, seed: randomSeedString() })) this.start();
  }

  /** PHÁT LẠI CÙNG SEED: tái tạo chính xác trận trước. */
  replaySameSeed() {
    audio.unlock();
    if (!this.lastMatch) {
      this.toast('Chưa có trận nào để phát lại.', 'error');
      return;
    }
    if (this.createMatch({ settings: this.lastMatch.settings, seed: this.lastMatch.seed })) this.start();
  }

  faster() {
    this.changeSpeed(1);
  }

  slower() {
    this.changeSpeed(-1);
  }

  changeSpeed(dir) {
    const cur = this.settings.simSpeed;
    let idx = SPEED_STEPS.findIndex((v) => v >= cur);
    if (idx < 0) idx = SPEED_STEPS.length - 1;
    idx = Math.max(0, Math.min(SPEED_STEPS.length - 1, idx + dir));
    this.updateSettings({ simSpeed: SPEED_STEPS[idx] });
    this.emitState();
  }

  /** TRẬN NGẪU NHIÊN: chọn ngẫu nhiên các loài được bật + số lượng, seed mới, bắt đầu. */
  randomBattle() {
    audio.unlock();
    const enabled = SPECIES.filter((s) => this.settings.enabled[s.id]).map((s) => s.id);
    if (enabled.length === 0) {
      this.toast('Hãy bật ít nhất một loài cá.', 'error');
      return;
    }
    const total = Math.max(LIMITS.minFish, Math.min(LIMITS.maxFish, this.settings.totalFish || this.rosterSize()));
    // xáo trộn bằng Math.random — chỉ để chọn cấu hình; mô phỏng dùng seed riêng
    const pool = enabled.slice().sort(() => Math.random() - 0.5);
    const k = Math.max(1, Math.min(pool.length, total, 2 + Math.floor(Math.random() * (pool.length - 1))));
    const chosen = pool.slice(0, k);
    const counts = Object.fromEntries(SPECIES.map((s) => [s.id, 0]));
    for (const id of chosen) counts[id] = 1;
    for (let i = k; i < total; i++) counts[chosen[Math.floor(Math.random() * k)]]++;
    this.settings.counts = counts;
    this.settings.totalFish = total;
    this.saveSettings();
    this.emit('settings', this.settings);
    if (this.createMatch({ seed: randomSeedString() })) this.start();
  }

  /** Gọi mỗi khung hình từ BattleScene. */
  tick(dtSeconds) {
    const sim = this.sim;
    if (!sim) return [];
    const dt = Math.min(dtSeconds, 0.1);
    let speed = 0;
    if (this.state === 'intro' && this.introElapsed() >= this.intro.duration) {
      this.state = 'running';
      this.emitState();
    }
    if (this.state === 'running') speed = this.settings.simSpeed;
    // chậm động tác ngắn khi có tuyệt chiêu (chỉ ảnh hưởng nhịp hiển thị, không đổi kết quả)
    if (speed > 0 && performance.now() < this.slowUntil) speed *= this.slowFactor || 0.3;
    else if (this.state === 'victory' || this.state === 'over') speed = 1; // cá vẫn bơi nhẹ sau trận
    if (speed > 0) {
      this.acc += dt * speed;
      let n = Math.floor(this.acc / SIM_DT);
      if (n > MAX_STEPS_PER_FRAME) {
        n = MAX_STEPS_PER_FRAME;
        this.acc = 0;
      } else this.acc -= n * SIM_DT;
      for (let i = 0; i < n; i++) sim.step();
    }
    const events = sim.drainEvents();
    for (const e of events) {
      if (e.type === 'victory') this.onVictory(e);
    }
    if (this.state === 'victory' && performance.now() - this.victoryAt >= this.settings.victoryHold * 1000) {
      this.state = 'over';
      this.emitState();
      this.emit('result', this.buildResult());
    }
    this.statsTimer += dt;
    if (this.statsTimer > 0.25) {
      this.statsTimer = 0;
      this.emitStats();
    }
    this.checkRecording();
    return events;
  }

  onVictory() {
    if (this.state === 'victory' || this.state === 'over') return;
    this.state = 'victory';
    this.victoryAt = performance.now();
    this.history = recordMatch(this.sim.result);
    this.emitState();
    this.emitStats(true);
  }

  buildResult() {
    const sim = this.sim;
    const ranking = sim.fish
      .slice()
      .sort((a, b) => (b.alive - a.alive) || b.kills - a.kills || b.damageDealt - a.damageDealt || a.id - b.id);
    return { ...sim.result, stats: { ...sim.stats }, ranking, history: this.history };
  }

  summary() {
    const sim = this.sim;
    if (!sim) return null;
    return {
      initial: sim.fish.length,
      alive: sim.alive.length,
      eliminated: sim.fish.length - sim.alive.length,
      time: sim.over ? sim.result.duration : sim.time,
      hits: sim.stats.totalHits,
      damage: sim.stats.totalDamage,
      clashes: sim.stats.clashes,
      seed: sim.seed,
      fish: sim.fish,
      over: sim.over,
      result: sim.result,
    };
  }

  emitStats(force) {
    this.emit('stats', this.summary(), force);
  }

  emitState() {
    this.emit('state', { state: this.state, speed: this.settings.simSpeed, recording: this.recorder.active });
  }

  toast(msg, kind = 'info') {
    this.emit('toast', { msg, kind });
  }

  // ---------- ghi hình ----------
  recordingSupport() {
    return detectRecordingSupport();
  }

  async recordAndStart() {
    if (this.recorder.active) return;
    const support = detectRecordingSupport();
    if (!support.supported) {
      this.toast(support.reason, 'error');
      return;
    }
    audio.unlock();
    // Chuyển canvas sang khung dọc 1080×1920 thật sự (không chỉ đổi kích thước CSS)
    this.layout = 'record';
    if (!this.createMatch({ seed: (this.settings.seed && this.settings.seed.trim()) || randomSeedString() })) {
      this.layout = 'normal';
      return;
    }
    // BattleScene có thể vừa được khởi động từ màn hình chờ — đợi nó sẵn sàng
    for (let i = 0; i < 100 && !this.scene; i++) await new Promise((r) => setTimeout(r, 20));
    if (!this.scene) {
      this.layout = 'normal';
      this.toast('Không khởi tạo được đấu trường để ghi hình.', 'error');
      return;
    }
    this.scene.setLayout('record');
    // chờ canvas vẽ xong khung dọc đầu tiên (có timeout phòng khi rAF bị trình duyệt tạm ngưng)
    await new Promise((r) => {
      const timer = setTimeout(r, 150);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearTimeout(timer);
        r();
      }));
    });
    try {
      const fmt = this.recorder.start(this.scene.game.canvas, this.settings.sfx || this.settings.music ? audio.recordStream : null);
      const dur = Number(this.settings.recDuration) || 0;
      this.recording = { duration: dur > 0 ? dur : UNTIL_END_MAX, untilEnd: dur === 0 };
      this.emit('recording', { status: 'started', format: fmt, duration: this.recording.duration });
      this.start();
      this.emitState();
    } catch (err) {
      this.scene.setLayout('normal');
      this.layout = 'normal';
      this.toast(`Không thể ghi hình: ${err.message}`, 'error');
    }
  }

  checkRecording() {
    if (!this.recording || !this.recorder.active) return;
    const el = this.recorder.elapsed;
    const rec = this.recording;
    let stop = el >= rec.duration;
    // trận kết thúc trước thời lượng: giữ khung hình chiến thắng rồi dừng
    if (!stop && (this.state === 'victory' || this.state === 'over')) {
      const held = (performance.now() - this.victoryAt) / 1000;
      const hold = Math.max(2, this.settings.victoryHold);
      if (held >= hold) stop = true;
    }
    this.emit('recording', { status: 'progress', elapsed: el, duration: rec.duration });
    if (stop) this.stopRecording();
  }

  async stopRecording() {
    if (!this.recorder.active) return;
    this.recording = null;
    try {
      const out = await this.recorder.stop();
      this.emit('recording', { status: 'done', ...out, seed: this.sim ? this.sim.seed : '' });
    } catch (err) {
      this.toast(`Lỗi ghi hình: ${err.message}`, 'error');
      this.emit('recording', { status: 'error' });
    }
    this.scene.setLayout('normal');
    this.layout = 'normal';
    this.emitState();
  }
}
