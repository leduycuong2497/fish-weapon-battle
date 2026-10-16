import { LIMITS, SPECIES } from '../config.js';
import { loadHistory, clearHistory } from '../systems/BattleStatistics.js';
import { THEMES } from '../render/ArenaThemes.js';
import { FACE_MODES } from '../render/Facing.js';

const STATE_LABEL = {
  idle: 'Chưa có trận',
  ready: 'Sẵn sàng',
  running: 'Đang đấu',
  paused: 'Tạm dừng',
  victory: 'Kết thúc!',
  intro: 'Ra mắt…',
  over: 'Kết thúc',
};

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) e.append(c);
  return e;
}

function hex(c) {
  return `#${c.toString(16).padStart(6, '0')}`;
}

export class Controls {
  constructor(controller, { panel, quickbar, pill, toggle, layout }) {
    this.c = controller;
    this.panel = panel;
    this.quickbar = quickbar;
    this.pill = pill;
    this.buttons = {};
    this.inputs = {};
    this.icons = {};

    toggle.addEventListener('click', () => {
      const collapsed = layout.classList.toggle('collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      window.dispatchEvent(new Event('resize'));
    });

    this.build();
    controller.on('settings', () => this.syncInputs());
    controller.on('state', (s) => this.onState(s));
    controller.on('result', () => this.renderHistory());
    this.syncInputs();
    this.onState({ state: 'idle', speed: controller.settings.simSpeed });
  }

  btn(key, label, cls, onClick, title) {
    const b = el('button', { class: `btn ${cls || ''}`, type: 'button', title: title || label, onclick: onClick }, label);
    this.buttons[key] = this.buttons[key] || [];
    this.buttons[key].push(b);
    return b;
  }

  section(title, open, children) {
    return el('details', { open }, [el('summary', { text: title }), el('div', { class: 'sec' }, children)]);
  }

  build() {
    const c = this.c;
    const s = c.settings;

    // ----- thanh nút nhanh dưới đấu trường -----
    this.quickbar.append(
      this.btn('start', '▶ BẮT ĐẦU', 'green', () => c.start()),
      this.btn('pause', '⏸ TẠM DỪNG', '', () => c.pause()),
      this.btn('resume', '⏵ TIẾP TỤC', 'green', () => c.resume()),
      this.btn('again', '🔁 CHẠY LẠI', 'blue', () => c.runAgain(), 'Chạy lại cùng cấu hình với seed mới'),
      this.btn('random', '🎲 NGẪU NHIÊN', 'blue', () => c.randomBattle(), 'Trận ngẫu nhiên'),
    );

    // ----- Điều khiển -----
    this.speedLabel = el('b', { text: `×${s.simSpeed}` });
    const ctrl = this.section('🎮 Điều khiển trận', true, [
      el('div', { class: 'btn-grid' }, [
        this.btn('create', 'TẠO TRẬN', 'blue', () => c.createMatch(), 'Tạo trận mới theo cấu hình (chưa chạy)'),
        this.btn('start', 'BẮT ĐẦU', 'green', () => c.start()),
        this.btn('pause', 'TẠM DỪNG', '', () => c.pause()),
        this.btn('resume', 'TIẾP TỤC', 'green', () => c.resume()),
        this.btn('again', 'CHẠY LẠI', 'blue', () => c.runAgain(), 'Cùng cấu hình trận trước, seed mới'),
        this.btn('replay', 'PHÁT LẠI CÙNG SEED', 'blue', () => c.replaySameSeed(), 'Tái tạo chính xác trận trước'),
        this.btn('slower', '⏪ GIẢM TỐC', '', () => c.slower()),
        this.btn('faster', 'TĂNG TỐC ⏩', '', () => c.faster()),
        this.btn('random', '🎲 TRẬN NGẪU NHIÊN', 'blue wide', () => c.randomBattle()),
        this.btn('reset', 'ĐẶT LẠI CẤU HÌNH', 'ghost wide', () => c.resetSettings()),
      ]),
      el('div', { class: 'row' }, [el('label', { text: 'Tốc độ trận đấu' }), this.speedLabel]),
      (this.seedInfo = el('p', { class: 'hint', text: 'Seed trận hiện tại: —' })),
    ]);

    // ----- Ghi hình -----
    const support = c.recordingSupport();
    this.recDuration = el(
      'select',
      { onchange: (e) => c.updateSettings({ recDuration: Number(e.target.value) }) },
      [20, 30, 45, 60, 0].map((v) => el('option', { value: v, text: v ? `${v} giây` : 'Đến khi kết thúc (tối đa 90s)' })),
    );
    const fmtHint = support.supported
      ? support.isMp4
        ? `✅ Trình duyệt hỗ trợ xuất MP4 trực tiếp (${support.mime}).`
        : `⚠️ Trình duyệt chỉ hỗ trợ WebM (${support.mime}). Video sẽ xuất .webm — xem hướng dẫn chuyển sang MP4 bên dưới.`
      : `❌ ${support.reason}`;
    const rec = this.section('🎬 Ghi hình Reels 9:16', true, [
      el('div', { class: 'row' }, [el('label', { text: 'Thời lượng' }), this.recDuration]),
      el('p', { class: `hint ${support.supported && !support.isMp4 ? 'warn' : ''}`, text: fmtHint }),
      el('p', { class: 'hint', text: '1080×1920 • 30 FPS • chỉ ghi đấu trường (không ghi bảng điều khiển, con trỏ chuột).' }),
      el('div', { class: 'btn-grid' }, [
        this.btn('record', '⏺ GHI HÌNH & BẮT ĐẦU', 'red wide', () => c.recordAndStart()),
        this.btn('stoprec', '⏹ DỪNG GHI', '', () => c.stopRecording()),
        this.btn('export', '⬇ XUẤT VIDEO', 'green', () => this.exportVideo()),
      ]),
    ]);
    if (!support.supported) this.buttons.record.forEach((b) => (b.disabled = true));

    // ----- Trận đấu & loài -----
    this.totalRange = el('input', { type: 'range', min: LIMITS.minFish, max: LIMITS.maxFish, step: 1 });
    this.totalNum = el('input', { type: 'number', min: LIMITS.minFish, max: LIMITS.maxFish, step: 1 });
    const onTotal = (v) => c.distributeTotal(Number(v));
    this.totalRange.addEventListener('input', (e) => onTotal(e.target.value));
    this.totalNum.addEventListener('change', (e) => onTotal(e.target.value));
    this.speciesRows = {};
    const list = el('div', { class: 'species-list' });
    for (const sp of SPECIES) {
      const chk = el('input', { type: 'checkbox', title: 'Cho phép tham gia' });
      chk.addEventListener('change', () => {
        c.settings.enabled[sp.id] = chk.checked;
        c.updateSettings({});
        this.updateTotal();
      });
      const num = el('input', { type: 'number', min: 0, max: LIMITS.maxFish, step: 1 });
      num.addEventListener('change', () => {
        c.settings.counts[sp.id] = Math.max(0, Math.min(LIMITS.maxFish, Math.round(Number(num.value) || 0)));
        // giữ tổng ≤ 100
        const total = c.rosterSize();
        if (total > LIMITS.maxFish) c.settings.counts[sp.id] -= total - LIMITS.maxFish;
        c.settings.totalFish = c.rosterSize();
        c.updateSettings({});
      });
      const icon = el('img', { alt: sp.name });
      this.icons[sp.id] = icon;
      const row = el('div', { class: 'species-row', title: sp.desc }, [
        chk,
        icon,
        el('div', { class: 'nm', html: `<span class="dot" style="background:${hex(sp.color)}"></span>${sp.name}<small>HP ${sp.hp} • ST ${sp.damage} • ${sp.skill.name}</small>` }),
        num,
      ]);
      this.speciesRows[sp.id] = { row, chk, num };
      list.append(row);
    }
    this.seedInput = el('input', { type: 'text', placeholder: 'Để trống = seed ngẫu nhiên', maxlength: 40 });
    this.seedInput.addEventListener('change', () => c.updateSettings({ seed: this.seedInput.value.trim() }));
    this.totalWarn = el('p', { class: 'hint warn' });
    const match = this.section('🐟 Thiết lập trận đấu', true, [
      el('div', { class: 'slider-row' }, [el('div', { class: 'head' }, [el('span', { text: 'Tổng số cá (2–100)' }), this.totalNum]), this.totalRange]),
      el('p', { class: 'hint', text: 'Kéo thanh để chia đều cho các loài đang bật, hoặc nhập số lượng từng loài.' }),
      list,
      this.totalWarn,
      el('div', { class: 'row' }, [el('label', { text: 'Seed (tái tạo trận)' }), this.seedInput]),
    ]);

    // ----- Chế độ -----
    this.inputs.mode = el('select', { onchange: (e) => c.updateSettings({ mode: e.target.value }) }, [
      el('option', { value: 'ffa', text: 'Sinh tồn — mỗi cá tự chiến' }),
      el('option', { value: 'teams', text: 'Chia đội' }),
    ]);
    this.inputs.teams = el('select', { onchange: (e) => c.updateSettings({ teams: Number(e.target.value) }) }, [2, 3, 4].map((n) => el('option', { value: n, text: `${n} đội` })));
    const modes = this.section('⚔️ Chế độ', false, [
      el('div', { class: 'row' }, [el('label', { text: 'Chế độ' }), this.inputs.mode]),
      el('div', { class: 'row' }, [el('label', { text: 'Số đội' }), this.inputs.teams]),
      this.check('skills', 'Kỹ năng đặc biệt'),
      this.check('energy', 'Nội năng & tuyệt chiêu (bị đánh tích nội năng)'),
      this.check('evolution', 'Tiến hóa (lên cấp khi hạ gục, tối đa 5)'),
      this.check('healOnKill', 'Hồi đầy máu khi hạ gục'),
      this.check('shrink', 'Thu hẹp đấu trường theo thời gian'),
      this.slider('shrinkStart', 'Bắt đầu thu hẹp sau (giây)', 5, 120, 5, (v) => `${v}s`),
      this.slider('timeLimit', 'Giới hạn thời gian (0 = không)', 0, 300, 10, (v) => (v ? `${v}s` : 'không')),
      this.slider('victoryHold', 'Giữ màn hình chiến thắng', 1, 10, 0.5, (v) => `${v}s`),
      el('p', { class: 'hint', text: 'Thay đổi cấu hình áp dụng cho trận được tạo tiếp theo.' }),
    ]);

    // ----- Chỉ số -----
    const pct = (v) => `×${Number(v).toFixed(2)}`;
    const stats = this.section('📊 Chỉ số (hệ số nhân)', false, [
      this.slider('hpMul', 'Máu tối đa', 0.25, 3, 0.05, pct),
      this.slider('dmgMul', 'Sát thương cơ bản', 0.25, 3, 0.05, pct),
      this.slider('speedMul', 'Tốc độ di chuyển', 0.3, 2.5, 0.05, pct),
      this.slider('rotMul', 'Tốc độ xoay vũ khí', 0.2, 3, 0.05, pct),
      this.slider('rangeMul', 'Tầm đánh', 0.5, 2, 0.05, pct),
      this.slider('massMul', 'Khối lượng nhân vật', 0.3, 3, 0.05, pct),
      this.slider('bounce', 'Độ bật khi va chạm', 0.1, 1.2, 0.05, (v) => Number(v).toFixed(2)),
      this.slider('randomness', 'Mức độ ngẫu nhiên khi đổi hướng', 0, 2.5, 0.05, pct),
      this.slider('wallDeflect', 'Lệch ngẫu nhiên sau khi chạm tường', 0, 60, 1, (v) => `±${v}°`),
      this.slider('chase', 'Hơi hướng về mục tiêu gần (tùy chọn)', 0, 20, 1, (v) => (v ? `${v}%` : 'tắt')),
    ]);

    // ----- Đấu trường -----
    this.inputs.arenaShape = el('select', { onchange: (e) => c.updateSettings({ arenaShape: e.target.value }) }, [
      el('option', { value: 'oval', text: 'Bầu dục dọc (giống video 9:16)' }),
      el('option', { value: 'circle', text: 'Hình tròn' }),
      el('option', { value: 'square', text: 'Hình vuông' }),
      el('option', { value: 'rect', text: 'Hình chữ nhật' }),
    ]);
    this.inputs.arenaTheme = el(
      'select',
      { onchange: (e) => c.updateSettings({ arenaTheme: e.target.value }) },
      [...THEMES.map((t) => el('option', { value: t.id, text: t.name })), el('option', { value: 'random', text: 'Ngẫu nhiên mỗi trận' })],
    );
    this.inputs.arenaSize = el('select', { onchange: (e) => c.updateSettings({ arenaSize: e.target.value }) }, [
      el('option', { value: 'auto', text: 'Tự động theo số cá' }),
      el('option', { value: 'small', text: 'Nhỏ' }),
      el('option', { value: 'medium', text: 'Vừa' }),
      el('option', { value: 'large', text: 'Lớn' }),
    ]);
    this.inputs.effects = el('select', { onchange: (e) => c.updateSettings({ effects: e.target.value }) }, [
      el('option', { value: 'high', text: 'Cao' }),
      el('option', { value: 'medium', text: 'Trung bình' }),
      el('option', { value: 'low', text: 'Thấp' }),
    ]);
    this.inputs.charStyle = el('select', { onchange: (e) => c.updateSettings({ charStyle: e.target.value }) }, [
      el('option', { value: 'cartoon', text: 'Hoạt hình 3D (giống video)' }),
      el('option', { value: 'concept', text: 'Hình minh họa (ảnh concept)' }),
      el('option', { value: 'real', text: '3D tả thực (theo concept)' }),
      el('option', { value: 'model3d', text: 'Mô hình 3D tự thêm (public/models)' }),
    ]);
    this.inputs.introStyle = el('select', { onchange: (e) => c.updateSettings({ introStyle: e.target.value }) }, [
      el('option', { value: 'cards', text: 'Thẻ giới thiệu (màn đối đầu + từng chiến binh)' }),
      el('option', { value: 'jumbotron', text: 'Điện ảnh: camera quay tới màn hình lớn trên khán đài' }),
      el('option', { value: 'off', text: 'Tắt (vào trận ngay)' }),
    ]);
    this.inputs.faceMode = el('select', { onchange: (e) => c.updateSettings({ faceMode: e.target.value }) }, FACE_MODES.map((m) => el('option', { value: m.id, text: m.name })));
    const arena = this.section('🏟️ Đấu trường & hiển thị', true, [
      el('div', { class: 'row' }, [el('label', { text: 'Chủ đề sàn đấu' }), this.inputs.arenaTheme]),
      el('div', { class: 'row' }, [el('label', { text: 'Hình dạng' }), this.inputs.arenaShape]),
      el('div', { class: 'row' }, [el('label', { text: 'Kích thước' }), this.inputs.arenaSize]),
      el('div', { class: 'row' }, [el('label', { text: 'Mức độ hiệu ứng' }), this.inputs.effects]),
      el('div', { class: 'row' }, [el('label', { text: 'Kiểu nhân vật' }), this.inputs.charStyle]),
      el('div', { class: 'row' }, [el('label', { text: 'Hướng mặt cá' }), this.inputs.faceMode]),
      this.check('render3d', 'Sàn đấu nghiêng 3D + nhân vật 3D'),
      this.check('crowd', 'Khán giả trên khán đài (cổ vũ, ném đồ, bóng thoại, trò nghịch)'),
      el('div', { class: 'row' }, [el('label', { text: 'Kiểu giới thiệu nhân vật' }), this.inputs.introStyle]),
      this.check('intro', 'Màn ra mắt đầu trận (luồng sáng)'),
      this.check('showColliders', 'Hiện collider (kiểm tra va chạm)'),
    ]);

    // ----- Âm thanh -----
    const sound = this.section('🔊 Âm thanh', false, [this.check('sfx', 'Hiệu ứng âm thanh'), this.check('music', 'Nhạc nền')]);

    // ----- Lịch sử -----
    this.historyBox = el('div', { class: 'wins-list' });
    const hist = this.section('🏆 Lịch sử thắng theo loài', false, [
      this.historyBox,
      el('button', {
        class: 'btn ghost',
        type: 'button',
        text: 'Xóa lịch sử',
        onclick: () => {
          clearHistory();
          this.renderHistory();
        },
      }),
    ]);

    this.panel.append(ctrl, match, rec, modes, stats, arena, sound, hist);
    this.renderHistory();
  }

  check(key, label) {
    const inp = el('input', { type: 'checkbox' });
    inp.addEventListener('change', () => this.c.updateSettings({ [key]: inp.checked }));
    this.inputs[key] = inp;
    return el('label', { class: 'check' }, [inp, el('span', { text: label })]);
  }

  slider(key, label, min, max, step, fmt) {
    const val = el('b');
    const inp = el('input', { type: 'range', min, max, step });
    inp.addEventListener('input', () => {
      val.textContent = fmt(inp.value);
      this.c.updateSettings({ [key]: Number(inp.value) });
    });
    this.inputs[key] = inp;
    this.sliderLabels = this.sliderLabels || {};
    this.sliderLabels[key] = { val, fmt };
    return el('div', { class: 'slider-row' }, [el('div', { class: 'head' }, [el('span', { text: label }), val]), inp]);
  }

  syncInputs() {
    const s = this.c.settings;
    for (const [k, inp] of Object.entries(this.inputs)) {
      if (inp.type === 'checkbox') inp.checked = !!s[k];
      else inp.value = s[k];
      if (this.sliderLabels?.[k]) this.sliderLabels[k].val.textContent = this.sliderLabels[k].fmt(s[k]);
    }
    for (const sp of SPECIES) {
      const r = this.speciesRows[sp.id];
      r.chk.checked = !!s.enabled[sp.id];
      r.num.value = s.counts[sp.id] || 0;
      r.num.disabled = !s.enabled[sp.id];
      r.row.classList.toggle('off', !s.enabled[sp.id]);
    }
    this.seedInput.value = s.seed || '';
    this.recDuration.value = String(s.recDuration);
    this.speedLabel.textContent = `×${s.simSpeed}`;
    this.updateTotal();
  }

  updateTotal() {
    const total = this.c.rosterSize();
    this.totalRange.value = total;
    this.totalNum.value = total;
    this.totalWarn.textContent = total < LIMITS.minFish ? `⚠️ Cần ít nhất ${LIMITS.minFish} cá (hiện có ${total}).` : '';
  }

  setIcons(dataUrls) {
    for (const [id, url] of Object.entries(dataUrls)) if (this.icons[id]) this.icons[id].src = url;
  }

  enable(key, on) {
    for (const b of this.buttons[key] || []) b.disabled = !on;
  }

  onState({ state, speed, recording }) {
    const rec = !!recording;
    this.pill.textContent = rec ? '● ĐANG GHI' : STATE_LABEL[state] || state;
    this.pill.className = `pill ${rec ? 'rec' : state}`;
    this.enable('start', !rec && (state === 'idle' || state === 'ready' || state === 'over' || state === 'victory'));
    this.enable('pause', state === 'running');
    this.enable('resume', state === 'paused');
    this.enable('create', !rec);
    this.enable('again', !rec);
    this.enable('random', !rec);
    this.enable('replay', !rec && !!this.c.lastMatch);
    this.enable('reset', !rec);
    this.enable('record', !rec && this.c.recordingSupport().supported);
    this.enable('stoprec', rec);
    this.enable('export', !!this.c.recorder.lastUrl);
    this.speedLabel.textContent = `×${speed}`;
    if (this.c.sim) this.seedInfo.textContent = `Seed trận hiện tại: ${this.c.sim.seed}`;
  }

  exportVideo() {
    const r = this.c.recorder;
    if (!r.lastUrl) {
      this.c.toast('Chưa có video. Hãy nhấn GHI HÌNH & BẮT ĐẦU trước.', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = r.lastUrl;
    a.download = `fish-weapon-battle-${this.c.sim ? this.c.sim.seed : 'video'}.${r.format.ext}`;
    document.body.append(a);
    a.click();
    a.remove();
  }

  renderHistory() {
    const h = loadHistory();
    const box = this.historyBox;
    box.innerHTML = '';
    const total = Object.values(h.wins).reduce((a, b) => a + b, 0);
    if (!total) {
      box.append(el('p', { class: 'hint', text: 'Chưa có trận nào được lưu.' }));
      return;
    }
    const max = Math.max(...Object.values(h.wins));
    for (const sp of SPECIES) {
      const w = h.wins[sp.id] || 0;
      box.append(
        el('div', {}, [
          el('div', { class: 'row' }, [el('span', { html: `<span class="dot" style="background:${hex(sp.color)}"></span>${sp.name}` }), el('b', { text: `${w} trận` })]),
          el('div', { class: 'bar', style: `width:${max ? (w / max) * 100 : 0}%` }),
        ]),
      );
    }
    box.append(el('p', { class: 'hint', text: `Tổng ${h.matches.length} trận gần nhất được lưu.` }));
  }
}

export { el, hex };
