# 🐟 FISH WEAPON BATTLE

Đấu trường cá vũ khí tự động & công cụ tạo video dọc cho Facebook Reels.
Cá di chuyển ngẫu nhiên, vũ khí xoay liên tục, sát thương chỉ xảy ra khi collider vũ khí **thực sự** chạm thân đối thủ.

## 1. Cài đặt & chạy

Yêu cầu: Node.js ≥ 18 (đã thử với Node 24), Chrome/Edge bản mới (khuyên dùng để xuất MP4 trực tiếp).

```bash
npm install
npm run dev        # mở http://localhost:5173
npm test           # kiểm thử headless lõi mô phỏng (Node)
npm run build      # bản production trong dist/
npm run preview    # chạy thử bản build ở http://localhost:4173
```

Công cụ cân bằng (chạy hàng loạt trận, in tỉ lệ thắng theo loài và ma trận 1v1):

```bash
node tests/balance.mjs 60 1
```

## 2. Công nghệ & kiến trúc

| Phần | Công nghệ |
|---|---|
| Hiển thị | Phaser 3.88 (WebGL/Canvas), đồ họa vector sinh texture lúc khởi động |
| Vật lý | Engine 2D tự viết, **tất định** (fixed timestep 60 Hz, spatial hash broad-phase) |
| Âm thanh | Web Audio API (tổng hợp, không dùng tệp có bản quyền) |
| Ghi hình | `canvas.captureStream(30)` + MediaRecorder (MP4 nếu hỗ trợ, nếu không thì WebM) |
| Build | Vite 5, ES Modules |

**Vì sao không dùng Matter.js/Arcade?** Yêu cầu "replay cùng seed" cần mô phỏng tái tạo được tuyệt đối. Engine tự viết chạy fixed timestep, toàn bộ ngẫu nhiên đi qua RNG có seed (mulberry32, mỗi cá một RNG riêng), không phụ thuộc thời gian khung hình — và chạy được cả trong Node để kiểm thử tự động. Chỉ có **một** hệ thống vật lý.

Logic mô phỏng (`src/sim`, `src/entities`, `src/systems`) tách hoàn toàn khỏi hiển thị (`src/scenes`, `src/render`, `src/ui`):

```
src/
├── main.js                 khởi tạo Phaser + UI
├── config.js               TOÀN BỘ thông số loài/cân bằng (một chỗ duy nhất)
├── GameController.js       trạng thái ứng dụng, nút bấm, vòng lặp fixed-step, ghi hình
├── sim/                    Simulation (tất định), RNG có seed, toán hình học
├── entities/               Fish, Weapon (collider từng loại vũ khí), Arena
├── systems/                Physics, Movement, Combat, AI, Evolution, BattleStatistics,
│                           Audio, Recording
├── render/                 FishArt (8 loài), WeaponArt (vẽ đúng collider), Effects (object pool)
├── scenes/                 BootScene (sinh texture), MenuScene, BattleScene
└── ui/                     Controls, Statistics, ResultsPanel, RecordPanel
tests/sim.test.js           kiểm thử tự động
tests/balance.mjs           công cụ cân bằng
```

## 3. Hướng dẫn sử dụng giao diện

- **Máy tính:** bảng điều khiển bên trái, đấu trường bên phải. **Điện thoại:** đấu trường ở trên, bảng điều khiển ở dưới; nút ☰ thu gọn/mở bảng điều khiển.
- **Điều khiển trận:**
  - `TẠO TRẬN` – tạo trận theo cấu hình (chưa chạy, xem vị trí xuất phát).
  - `BẮT ĐẦU` / `TẠM DỪNG` / `TIẾP TỤC` (phím tắt **Space**).
  - `CHẠY LẠI` – cùng cấu hình trận trước, **seed mới** (phím tắt **R**).
  - `PHÁT LẠI CÙNG SEED` – tái tạo chính xác trận trước.
  - `GIẢM TỐC` / `TĂNG TỐC` – ×0.25 … ×4 (vẫn fixed timestep, chỉ chạy nhiều/ít bước hơn mỗi khung hình).
  - `TRẬN NGẪU NHIÊN` – chọn ngẫu nhiên một số loài trong các loài được bật, chia ngẫu nhiên tổng số cá, seed mới, bắt đầu luôn.
  - `ĐẶT LẠI CẤU HÌNH` – về mặc định.
- **Thiết lập trận:** tổng số cá 2–100 (kéo thanh để chia đều), bật/tắt và nhập số lượng từng loài, ô Seed (để trống = ngẫu nhiên; nhập seed để tái tạo trận).
- **Chế độ:** Sinh tồn (mỗi cá tự chiến) / Chia đội (2–4 đội, không đánh đồng đội), kỹ năng đặc biệt, tiến hóa, hồi máu khi hạ gục, thu hẹp đấu trường, giới hạn thời gian, thời gian giữ màn hình chiến thắng.
- **Chỉ số (hệ số nhân):** máu, sát thương, tốc độ, tốc độ xoay vũ khí, tầm đánh, khối lượng, độ bật, mức ngẫu nhiên khi đổi hướng, độ lệch sau khi chạm tường, tùy chọn hơi hướng về mục tiêu gần (mặc định tắt).
- **Đấu trường & hiển thị:** tròn / vuông / chữ nhật, kích thước, mức hiệu ứng, "Hiện collider" để tự kiểm tra va chạm bằng mắt.
- Thay đổi cấu hình áp dụng cho **trận được tạo tiếp theo** (trừ âm thanh, tốc độ, hiển thị collider — áp dụng ngay). Cấu hình và lịch sử thắng được lưu trong `localStorage`.

## 4. Các loài cá

| Loài | HP | ST | Tốc độ | Xoay | Vũ khí (collider) | Kỹ năng |
|---|---|---|---|---|---|---|
| Cá Kiếm | 100 | 20 | 170 | 4.5 | Kiếm dài (capsule) | Lao tới – tăng tốc ngắn |
| Cá Nóc | 120 | 12 | 125 | 3.2 | 8 gai quanh thân (8 hình tròn nhỏ) | Phồng gai – gai dài ×1.8, ST ×1.5 |
| Cá Piranha | 85 | 10 | 185 | 6.0 | Hai dao ngắn (2 capsule đối xứng) | Cuồng loạn – xoay nhanh, hồi đòn nhanh |
| Cá Đuối | 95 | 15 | 160 | 4.0 | Đuôi điện (capsule, gây chậm) | Phóng điện – vùng tròn gây sát thương + choáng, có hồi chiêu |
| Cá Mập | 160 | 25 | 120 | 3.0 | Hàm răng lớn (hình tròn) | Khát máu – hút 25% sát thương (bị động) |
| Cá Rô Phi | 115 | 18 | 145 | 4.0 | Chùy (đầu chùy hình tròn) | Vảy cứng – giảm 50% sát thương khi máu thấp |
| Cá Rồng | 95 | 28 | 135 | 2.8 | Giáo rất dài (capsule hẹp) | Phóng giáo – tầm ×1.4 |
| Cá Ngựa | 90 | 16 | 200 | 5.5 | Đuôi móc (capsule + móc tròn) | Xoáy lốc – đổi hướng gắt, xoay nhanh |

Thông số trong tài liệu ý tưởng được giữ làm điểm xuất phát; một số chỉ số (Cá Ngựa, Cá Rô Phi, hồi đòn) đã chỉnh sau khi chạy công cụ cân bằng. Mọi thông số nằm trong `src/config.js`.

## 5. Cơ chế chính (tóm tắt)

- **Di chuyển:** mỗi cá có vận tốc, hướng mục tiêu, RNG riêng; cứ 0,6–2,5 s (ngẫu nhiên theo từng cá) đổi hướng ±35° × mức ngẫu nhiên; vận tốc xoay dần về hướng mới (không giật), tốc độ hội tụ về tốc độ loài và luôn ≥ tốc độ tối thiểu.
- **Chạm tường:** tính pháp tuyến tại điểm chạm → phản xạ vật lý `v' = v − 2(v·n)n` → lệch ngẫu nhiên ±45° → bảo đảm hướng vào trong ít nhất ~13° (không miết/rung theo tường) → đẩy phần xuyên tường về mép trong. Chỉ xử lý khi vận tốc còn hướng ra ngoài + mỗi bước một lần.
- **Chống lặp quỹ đạo:** nhớ 6 lần chạm tường gần nhất; nếu chạm lại cùng vùng ≥2 lần, tăng biên độ lệch (tối đa 85°).
- **Va chạm cá–cá:** tách vị trí theo khối lượng + xung lực có hệ số bật; lệch hướng nhỏ ±8° sau va chạm.
- **Vũ khí:** góc xoay độc lập với hướng bơi. Sát thương chỉ khi shape vũ khí giao thân mục tiêu, mục tiêu còn sống, không trong thời gian hồi (hồi riêng cho từng mục tiêu). Hai vũ khí chạm nhau → **đỡ đòn**: cả hai đảo chiều xoay, không ai mất máu ở bước đó (gai cá nóc là giáp nên không đỡ đòn).
- **Loại & thắng:** cá hết máu bị đánh dấu trong bước, cuối bước mới loại (công bằng, không phụ thuộc thứ tự). Còn 1 cá (hoặc 1 đội) → thắng. Tất cả cá cuối cùng chết cùng một bước → **HÒA**. Hết giờ → thắng theo % máu (rồi sát thương gây ra, rồi id).
- **Thu hẹp đấu trường** (mặc định bật sau 20 s) giúp trận không kéo dài vô hạn — hợp với video ngắn.

## 6. Xuất video Facebook Reels

1. Thiết lập trận (gợi ý: 6–12 cá, tốc độ ×1, hiệu ứng Cao).
2. Chọn **Thời lượng**: 20 / 30 / 45 / 60 giây hoặc "Đến khi kết thúc" (tối đa 90 s).
3. Nhấn **⏺ GHI HÌNH & BẮT ĐẦU**. Canvas chuyển sang khung dọc **1080×1920 thật** (không chỉ đổi CSS), trận mới bắt đầu và được ghi ở 30 FPS kèm âm thanh trò chơi.
4. Ghi dừng khi hết thời lượng, hoặc khi trận kết thúc + giữ màn hình chiến thắng (≥ 2 s). Có thể bấm **⏹ DỪNG GHI** bất cứ lúc nào.
5. Xem trước ở khu vực "Video Reels" bên dưới đấu trường → **⬇ Tải xuống** hoặc **⬇ XUẤT VIDEO**.

Video chỉ chứa canvas đấu trường (tiêu đề, số cá còn lại, đồng hồ, bảng hạ gục) — không có bảng điều khiển, nút bấm hay con trỏ chuột.

**Định dạng:** ứng dụng kiểm tra `MediaRecorder.isTypeSupported` và ưu tiên MP4 (H.264/AAC – Chrome/Edge bản mới). Nếu trình duyệt chỉ hỗ trợ WebM, tệp được lưu đúng là `.webm` (không đổi đuôi giả) và giao diện hiện lệnh chuyển đổi thật:

```bash
ffmpeg -i fish-weapon-battle-SEED.webm -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -movflags +faststart fish-weapon-battle-SEED.mp4
```

Cài ffmpeg: Windows `winget install Gyan.FFmpeg`, macOS `brew install ffmpeg`, Linux `sudo apt install ffmpeg`.
Không có dữ liệu nào được tải lên máy chủ — mọi thứ xử lý trong trình duyệt.

## 7. Kết quả kiểm thử thực tế

**Tự động (`npm test`, Node 24) — 10/10 đạt.** Mỗi trận kiểm tra bất biến ở *từng bước* mô phỏng:

| Trận | Kết quả (seed cố định) | Bất biến kiểm tra |
|---|---|---|
| 2 cá | thắng sau ~43 s | không cá nào ra ngoài tường; không cá nào đứng yên > 1 s; |
| 4 cá | thắng sau ~51 s | không dịch chuyển tức thời (dịch chuyển tối đa/bước < 9 đơn vị); |
| 20 cá | thắng sau ~57 s | tốc độ cá còn sống luôn > 20; cá đã bị loại không gây sát thương; |
| 50 cá | thắng sau ~127 s | mỗi đòn trúng có sự kiện tương ứng; có va chạm tường; |
| 100 cá | thắng sau ~93 s | có kết quả thắng/hòa hợp lệ |

Cùng các kiểm thử: cùng seed → cùng trạng thái (hash) và kết quả; seed khác → trận khác; vũ khí xoay độc lập với hướng bơi; kiếm chạm thân trừ đúng sát thương, không trừ lặp trong thời gian hồi, thân chạm thân không gây sát thương; chế độ chia đội kết thúc đúng và có cá lên cấp; đấu trường vuông/chữ nhật không xuyên tường.

**Trong trình duyệt (Chrome/Edge nhúng, GPU Intel Iris Xe):**

- Trang tải không có lỗi console; màn hình chờ, đấu trường, thanh máu, hiệu ứng, HUD hiển thị đúng.
- Một trận 8 cá chạy tới kết thúc (kết quả HÒA do hai cá cuối hạ nhau cùng lúc) → bảng kết quả hiện đúng. `PHÁT LẠI CÙNG SEED` cho ra đúng trận đó (cùng 42,250 s, cùng 59 đòn trúng).
- `TẠO TRẬN`, `BẮT ĐẦU`, `TẠM DỪNG` (thời gian đứng yên), `TIẾP TỤC`, `TĂNG TỐC` (×1.5 → 3 s mô phỏng trong 2 s) đã thử bằng click.
- Chế độ chia đội 3 đội + đấu trường chữ nhật hiển thị đúng.
- Thời gian mỗi khung hình (mô phỏng + vẽ): 2 cá ≈ 2,5 ms, 20 cá ≈ 3,1 ms, 50 cá ≈ 5,1 ms, 100 cá ≈ 7,7 ms (ngân sách 60 FPS là 16,7 ms).
- Ghi hình 20 s: tệp **MP4 (`video/mp4`) 1080×1920, 19,95 s, ~22 MB**; đã trích một khung hình từ video để xác nhận chỉ có đấu trường, không có bảng điều khiển, không viền đen.
- Giao diện điện thoại (375×812): không tràn ngang, nút đủ lớn.

**Chưa kiểm thử / giới hạn đã biết:**

- Khung trình duyệt dùng để thử bị ẩn nên `requestAnimationFrame` không chạy; tôi phải tự đẩy khung hình bằng `game.step()`. Chưa quan sát trực tiếp độ mượt 60 FPS trong một tab hiển thị thật.
- Chưa nghe kiểm tra âm thanh trong video ghi được (luồng âm thanh được gắn vào bản ghi, nhưng chưa xác nhận bằng tai).
- Chưa thử trên Firefox/Safari (sẽ xuất WebM nếu không hỗ trợ MP4).
- Replay giống hệt nhau được bảo đảm trên **cùng trình duyệt/máy**. Giữa các trình duyệt khác nhau, `Math.sin/cos` có thể khác ở chữ số cuối nên trận có thể rẽ nhánh.
- Cân bằng chỉ ở mức chấp nhận được (tỉ lệ thắng 1v1 khoảng 23–66%); Cá Ngựa vẫn yếu nhất. Chỉnh trong `src/config.js` và chạy `node tests/balance.mjs`.

## 8. Tính năng

**Đã hoàn thành:** cả 3 giai đoạn — giao diện tiếng Việt responsive; 8 loài với đồ họa vector & vũ khí/collider riêng; di chuyển ngẫu nhiên + phản xạ tường có lệch + chống lặp; va chạm cá–cá theo khối lượng; vũ khí xoay độc lập, đỡ đòn; máu/loại/thắng/hòa/hết giờ; 8 kỹ năng; tiến hóa 5 cấp; chế độ chia đội; đấu trường tròn/vuông/chữ nhật + thu hẹp; thống kê trực tiếp + lịch sử thắng (localStorage); trận ngẫu nhiên, chạy lại, phát lại cùng seed; âm thanh & nhạc nền tổng hợp; hiệu ứng có object pool và giới hạn theo số cá; ghi hình 9:16 1080×1920 MP4/WebM, xem trước, tải xuống.

**Chưa làm:** chướng ngại vật trong đấu trường; chuyển WebM → MP4 ngay trong trình duyệt (hiện hướng dẫn dùng ffmpeg); tự động tạo hàng loạt video.

## 9. Khắc phục lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `npm install` báo `allow-scripts` cho esbuild | Chỉ là cảnh báo; Vite vẫn chạy (gói nhị phân `@esbuild/*` đã có). Nếu `npm run dev` lỗi esbuild: `npm approve-scripts esbuild` rồi `npm install` lại. |
| Không có âm thanh | Trình duyệt chỉ cho phát âm thanh sau một thao tác click; bấm nút bất kỳ. Kiểm tra mục 🔊 Âm thanh. |
| Video bị giật/ngắt quãng | Giữ tab đang ghi ở **phía trước** (tab nền bị trình duyệt giảm tốc), giảm mức hiệu ứng hoặc số cá. |
| Chỉ xuất được WebM | Dùng Chrome/Edge bản mới, hoặc chuyển bằng lệnh ffmpeg ở mục 6. |
| Facebook không nhận MP4 | MP4 từ MediaRecorder là dạng fragmented; chuẩn hóa lại: `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`. |
| Trận quá dài | Bật "Thu hẹp đấu trường", giảm "Bắt đầu thu hẹp", giảm số cá, tăng hệ số sát thương hoặc đặt giới hạn thời gian. |
| Muốn tái tạo một trận đã đăng | Nhập seed (hiện ở góc canvas/kết quả) vào ô Seed với cùng cấu hình → `TẠO TRẬN` → `BẮT ĐẦU`. |
| Giao diện lỗi sau khi chỉnh nhiều | `ĐẶT LẠI CẤU HÌNH`, hoặc xóa localStorage của trang. |

## 10. Nội năng & tuyệt chiêu

- Thanh **nội năng** (xanh lam) nằm dưới thanh máu. Bị trúng đòn tăng nhiều (theo % máu mất, công bằng giữa loài máu trâu và máu giấy), đánh trúng tăng ít. Gần đầy thì viền nhấp nháy.
- Đầy 100 → tự tung **tuyệt chiêu** riêng của loài (tất định, replay vẫn khớp). Khi tung: luồng sáng giáng xuống, sóng xung kích, tên chiêu, chậm động tác 0,45 s; cá phát sáng màu riêng và thanh nội năng rút dần theo thời gian hiệu lực.

| Loài | Tuyệt chiêu | Tác dụng |
|---|---|---|
| Cá Kiếm | Kiếm Vũ Bão | sát thương + đẩy lùi diện rộng, xoay kiếm & bơi nhanh |
| Cá Nóc | Bão Gai Độc | sát thương diện rộng, gai dài ×2 |
| Cá Piranha | Cuồng Phong Răng | hồi 15% máu, dao xoay nhanh, hồi đòn cực nhanh |
| Cá Đuối | Lôi Điện Vạn Quân | sét diện rộng, choáng 1,5 s |
| Cá Mập | Cuồng Nộ Huyết Ngư | hồi máu, tăng sát thương & tốc độ |
| Cá Rô Phi | Thiết Giáp Rô Phi | giảm 50% sát thương nhận, sóng chấn động |
| Cá Rồng | Long Thương Phá Thiên | giáo dài ×2, tăng sát thương |
| Cá Ngựa | Lốc Xoáy Đại Dương | xoay & bơi cực nhanh, hồi máu |

Bật/tắt ở mục ⚔️ Chế độ → "Nội năng & tuyệt chiêu". Thông số trong `src/config.js` (`ENERGY`, `ult` của từng loài).

## 11. Màn ra mắt & xếp đội hình

- Đầu trận cá xếp **đối xứng** (2 con hai bên, 4 con bốn góc, đông hơn thì thành các vòng đều).
- **Màn ra mắt**: từng con xuất hiện dưới luồng sáng, rồi "⚔ CHIẾN! ⚔". Mô phỏng chưa chạy trong lúc này nên không ảnh hưởng kết quả. Tắt ở "Màn ra mắt đầu trận".
"# fish-weapon-battle" 
