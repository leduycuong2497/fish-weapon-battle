import { SPECIES, TEAM_NAMES } from '../config.js';
import { el, hex } from './Controls.js';

function fmtTime(t) {
  const m = Math.floor(t / 60);
  return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** Bảng kết quả trận đấu (modal). */
export class ResultsPanel {
  constructor(controller, modal, icons) {
    this.c = controller;
    this.modal = modal;
    this.icons = icons;
    controller.on('result', (r) => {
      // không bật modal trong lúc ghi hình (modal là HTML nên không vào video, nhưng tránh che màn hình)
      this.show(r);
    });
    controller.on('match', () => this.hide());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  hide() {
    this.modal.hidden = true;
  }

  show(r) {
    const c = this.c;
    const teams = c.sim?.settings.mode === 'teams';
    const box = el('div', { class: 'box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Kết quả trận đấu' });
    box.append(el('h2', { text: r.draw ? '🤝 HÒA' : '🏆 CHIẾN THẮNG' }));
    const winner = el('div', { class: 'winner' });
    if (!r.draw && r.team === null) {
      const w = c.sim.fish[r.winnerIds[0]];
      if (this.icons[w.speciesId]) winner.append(el('img', { src: this.icons[w.speciesId], alt: w.species.name }));
      winner.append(el('span', { text: `${w.name}` }));
    } else {
      winner.append(el('span', { text: r.winnerLabel }));
    }
    box.append(winner, el('p', { class: 'reason', text: `${r.reason} • thời gian ${fmtTime(r.duration)} • seed ${r.seed}` }));

    box.append(
      el('div', { class: 'stat-grid' }, [
        ['Cá ban đầu', r.initialCount],
        ['Đòn trúng', r.stats.totalHits],
        ['Tổng sát thương', Math.round(r.stats.totalDamage)],
        ['Đỡ đòn', r.stats.clashes],
        ['Kỹ năng dùng', r.stats.skillsUsed],
        ['Tuyệt chiêu', r.stats.ultimates],
        ['Va chạm tường', r.stats.wallHits],
      ].map(([k, v]) => el('div', { class: 'stat' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })]))),
    );

    const rows = r.ranking.slice(0, 10).map((f, i) =>
      el('tr', { class: f.alive ? '' : '' }, [
        el('td', { text: `${i + 1}` }),
        el('td', { html: `<span class="dot" style="background:${hex(f.species.color)}"></span>${f.name}${teams ? ` (${TEAM_NAMES[f.team]})` : ''}` }),
        el('td', { text: f.alive ? 'Sống' : 'Bị loại' }),
        el('td', { text: f.kills }),
        el('td', { text: Math.round(f.damageDealt) }),
        el('td', { text: f.level }),
      ]),
    );
    box.append(
      el('div', { class: 'table-wrap' }, [
        el('table', {}, [el('thead', {}, [el('tr', {}, ['#', 'Cá', 'Trạng thái', 'Hạ gục', 'Sát thương', 'Cấp'].map((h) => el('th', { text: h })))]), el('tbody', {}, rows)]),
      ]),
    );

    if (r.history) {
      const wins = SPECIES.map((sp) => `${sp.name}: ${r.history.wins[sp.id] || 0}`).join(' • ');
      box.append(el('p', { class: 'hint', text: `Số trận thắng theo loài (lưu trên máy): ${wins}` }));
    }

    const close = el('button', { class: 'btn ghost', type: 'button', text: 'Đóng', onclick: () => this.hide() });
    box.append(
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn blue', type: 'button', text: '🔁 CHẠY LẠI (seed mới)', onclick: () => c.runAgain() }),
        el('button', { class: 'btn blue', type: 'button', text: '⏮ PHÁT LẠI CÙNG SEED', onclick: () => c.replaySameSeed() }),
        el('button', { class: 'btn green', type: 'button', text: '🎲 TRẬN NGẪU NHIÊN', onclick: () => c.randomBattle() }),
        close,
      ]),
    );
    this.modal.innerHTML = '';
    this.modal.append(box);
    this.modal.hidden = false;
    close.focus();
  }
}
