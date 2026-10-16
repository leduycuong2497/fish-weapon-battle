import { TEAM_COLORS, TEAM_NAMES } from '../config.js';
import { el, hex } from './Controls.js';

function fmtTime(t) {
  const m = Math.floor(t / 60);
  return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

const TOP_N = 12;

/** Bảng thống kê trực tiếp. */
export class Statistics {
  constructor(controller, root) {
    this.c = controller;
    this.root = root;
    root.append(el('h3', { text: '📈 Thống kê trực tiếp' }));
    this.grid = el('div', { class: 'stat-grid' });
    this.cards = {};
    for (const [k, label] of [
      ['initial', 'Tổng số cá ban đầu'],
      ['alive', 'Còn sống'],
      ['eliminated', 'Đã bị loại'],
      ['time', 'Thời gian'],
      ['hits', 'Đòn đánh hợp lệ'],
      ['damage', 'Tổng sát thương'],
      ['clashes', 'Lần đỡ đòn'],
    ]) {
      const v = el('div', { class: 'v', text: '—' });
      this.cards[k] = v;
      this.grid.append(el('div', { class: 'stat' }, [el('div', { class: 'k', text: label }), v]));
    }
    this.tbody = el('tbody');
    this.more = el('p', { class: 'hint' });
    root.append(
      this.grid,
      el('div', { class: 'table-wrap' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Cá', 'Máu', 'Hạ gục', 'Sát thương', 'Trúng', 'Cấp'].map((h) => el('th', { text: h })))]),
          this.tbody,
        ]),
      ]),
      this.more,
    );
    controller.on('stats', (s) => this.render(s));
    controller.on('match', () => (this.lastKey = ''));
  }

  render(s) {
    if (!s) return;
    this.cards.initial.textContent = s.initial;
    this.cards.alive.textContent = s.alive;
    this.cards.eliminated.textContent = s.eliminated;
    this.cards.time.textContent = fmtTime(s.time);
    this.cards.hits.textContent = s.hits;
    this.cards.damage.textContent = Math.round(s.damage);
    this.cards.clashes.textContent = s.clashes;

    const teams = s.fish.length && s.fish[0] && this.c.sim?.settings.mode === 'teams';
    const rows = s.fish
      .slice()
      .sort((a, b) => b.alive - a.alive || b.kills - a.kills || b.damageDealt - a.damageDealt || a.id - b.id)
      .slice(0, TOP_N);
    this.tbody.innerHTML = '';
    for (const f of rows) {
      const ratio = Math.max(0, f.hp / f.maxHp);
      const color = ratio > 0.6 ? '#00e676' : ratio > 0.3 ? '#ffea00' : '#ff1744';
      const team = teams ? ` <span class="dot" title="${TEAM_NAMES[f.team]}" style="background:${hex(TEAM_COLORS[f.team])}"></span>` : '';
      const tr = el('tr', { class: f.alive ? '' : 'dead' }, [
        el('td', { html: `<span class="dot" style="background:${hex(f.species.color)}"></span>${f.name}${team}` }),
        el('td', { html: `<div class="hpbar" title="${Math.ceil(f.hp)}/${f.maxHp}"><i style="width:${ratio * 100}%;background:${color}"></i></div>` }),
        el('td', { text: f.kills }),
        el('td', { text: Math.round(f.damageDealt) }),
        el('td', { text: f.hits }),
        el('td', { text: f.level }),
      ]);
      this.tbody.append(tr);
    }
    this.more.textContent = s.fish.length > TOP_N ? `Hiển thị ${TOP_N}/${s.fish.length} cá (sắp xếp theo còn sống → hạ gục → sát thương).` : '';
  }
}
