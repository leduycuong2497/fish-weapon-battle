import { el } from './Controls.js';

/** Khu vực ghi hình: tiến trình, xem trước, tải xuống, hướng dẫn chuyển đổi WebM → MP4. */
export class RecordPanel {
  constructor(controller, root, { badge, badgeTime, wrap }) {
    this.c = controller;
    this.root = root;
    this.badge = badge;
    this.badgeTime = badgeTime;
    this.wrap = wrap;
    root.append(el('h3', { text: '🎬 Video Reels' }));
    this.status = el('p', { class: 'hint', text: 'Chưa ghi video. Thiết lập trận rồi nhấn ⏺ GHI HÌNH & BẮT ĐẦU.' });
    this.bar = el('i');
    this.progress = el('div', { class: 'progress', hidden: true }, [this.bar]);
    this.preview = el('div', { class: 'rec-preview' });
    root.append(this.status, this.progress, this.preview);
    controller.on('recording', (e) => this.onRecording(e));
  }

  onRecording(e) {
    if (e.status === 'started') {
      this.badge.hidden = false;
      this.wrap.classList.add('portrait');
      this.progress.hidden = false;
      this.status.textContent = `Đang ghi ${e.format.isMp4 ? 'MP4' : 'WebM'} 1080×1920 @30fps (tối đa ${e.duration}s)… Giữ tab này mở trong lúc ghi.`;
      window.dispatchEvent(new Event('resize'));
    } else if (e.status === 'progress') {
      this.badgeTime.textContent = e.elapsed.toFixed(1);
      this.bar.style.width = `${Math.min(100, (e.elapsed / e.duration) * 100)}%`;
    } else if (e.status === 'done') {
      this.badge.hidden = true;
      this.wrap.classList.remove('portrait');
      this.progress.hidden = true;
      window.dispatchEvent(new Event('resize'));
      this.showPreview(e);
    } else if (e.status === 'error') {
      this.badge.hidden = true;
      this.wrap.classList.remove('portrait');
      this.progress.hidden = true;
      this.status.textContent = 'Ghi hình thất bại.';
    }
  }

  showPreview(e) {
    const name = `fish-weapon-battle-${e.seed}.${e.ext}`;
    const mb = (e.size / 1024 / 1024).toFixed(2);
    this.status.textContent = `✅ Đã ghi ${e.duration.toFixed(1)}s • ${mb} MB • ${e.mime}`;
    this.preview.innerHTML = '';
    const video = el('video', { src: e.url, controls: true, playsinline: true, loop: true });
    video.addEventListener('loadedmetadata', () => {
      const ratio = video.videoWidth && video.videoHeight ? `${video.videoWidth}×${video.videoHeight}` : 'không rõ';
      this.dim.textContent = `Kích thước khung hình thực tế: ${ratio}`;
    });
    this.dim = el('p', { class: 'hint' });
    const dl = el('a', { class: 'btn green', href: e.url, download: name, text: `⬇ Tải xuống ${name}`, style: 'text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center' });
    const info = el('div', { class: 'info' }, [dl, this.dim]);
    if (e.ext !== 'mp4') {
      info.append(
        el('p', { class: 'hint warn', text: 'Trình duyệt này chỉ xuất được WebM. Facebook Reels nhận cả WebM, nhưng nếu cần MP4 hãy chuyển đổi thật bằng ffmpeg (miễn phí, chạy trên máy bạn):' }),
        el('pre', { text: `ffmpeg -i ${name} -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -movflags +faststart ${name.replace(/\.webm$/, '.mp4')}` }),
        el('p', { class: 'hint', text: 'Cài ffmpeg: Windows → winget install Gyan.FFmpeg • macOS → brew install ffmpeg • Linux → sudo apt install ffmpeg. Hoặc dùng Chrome/Edge mới (hỗ trợ ghi MP4 trực tiếp).' }),
      );
    } else {
      info.append(el('p', { class: 'hint', text: 'Tệp MP4 (H.264) sẵn sàng đăng Facebook Reels.' }));
    }
    this.preview.append(video, info);
  }
}
