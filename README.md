# Kiểm tra thời khóa biểu giáo viên chuyên

Website tiếng Việt xử lý Excel ngay trên trình duyệt. File không được gửi lên máy chủ.
Luồng sử dụng: chọn Excel → kiểm tra → xem phương án → xác nhận → kiểm tra lại → tải bản mới.
Có lịch theo ngày, tìm giáo viên, bộ lọc lỗi và hoàn tác từng lần thay đổi.

## Chạy website

Yêu cầu Node.js 24. Thư viện trình duyệt đã có trong `vendor/`.

```powershell
cd C:\schedule-checker
npm start
```

Mở địa chỉ được in trong terminal, mặc định **http://127.0.0.1:5173**.
Nếu cổng bận, máy chủ chọn cổng tiếp theo. Địa chỉ này dùng trên máy đang chạy website.
Không mở `index.html` trực tiếp vì ứng dụng dùng ES modules và Web Worker.

**Mật khẩu: `TKB@2026`**, cấu hình tại `src/config.js`.
Đây là cổng truy cập cơ bản phía trình duyệt, không phải xác thực tài khoản.
Dữ liệu lịch chỉ nằm trong bộ nhớ; tải lại trang hoặc đăng xuất sẽ xóa phiên dữ liệu.

## Quy tắc hiện hành

| Ngày | Tiết tối đa của một lớp / sáng | Tiết tối đa của một lớp / chiều | Tiết tối đa của một giáo viên / ngày |
| --- | ---: | ---: | ---: |
| Thứ Hai | 1 | 2 | 6 |
| Thứ Ba | 3 | 2 | 7 |
| Thứ Tư | 2 | 2 | 4 |
| Thứ Năm | 3 | 2 | 7 |
| Thứ Sáu | 2 | 2 | 6 |

Ứng dụng kiểm tra bốn nhóm quy tắc:

1. Một lớp không trùng lịch giữa các giáo viên tại cùng ngày, buổi, tiết.
2. Số tiết giáo viên không vượt giới hạn ngày nêu trên.
3. Số tiết của một lớp trong buổi không vượt bảng trên; đếm trên tất cả giáo viên chuyên.
4. Trong lịch **từng giáo viên, cùng một buổi**, các tiết cùng lớp phải liền nhau.
   `1A – 1A – 2A` đúng; `1A – 2A – 1A` và `1A – trống – 1A` sai.
   Không gộp buổi sáng với chiều hoặc các giáo viên khác nhau.

`CC` / `CC phân hiệu` tại tiết 1 sáng Thứ Hai là chào cờ chung: không tính vào số tiết
chuyên, không di chuyển và không xếp tiết chuyên mới vào vị trí đó.
Ô chưa rõ lớp như `II` giữ nguyên, vẫn tính vào số tiết giáo viên và hiển thị cảnh báo.
Chỉ kết luận trên dữ liệu đã nhận diện; phạm vi là lịch giáo viên chuyên trong từng file.

## Chỉnh sửa và xuất Excel

Nhấn **Kiểm tra** để xem vi phạm và phương án ưu tiên. Nhấn **Chỉnh sửa** để xem trước
các cách chuyển tiết vào ô trống hoặc **đổi chỗ hai tiết của cùng giáo viên**.
Phương án đổi chỗ nêu cả hai lớp và hai vị trí Excel.
Lịch chỉ đổi khi nhấn xác nhận hoặc áp dụng. Danh sách **Áp dụng tất cả** được tìm tuần tự,
không phải ghép các gợi ý độc lập. Mỗi bước phải giảm mức vi phạm, không tạo lỗi mới
hoặc làm nặng lỗi khác, kể cả lỗi tiết không liền nhau. Không chuyển sang dòng có môn khác.
Kế hoạch còn lỗi sẽ liệt kê lỗi còn lại; bộ tìm kiếm chưa bảo đảm tối ưu toàn cục.

**Thay đổi → Hoàn tác** khôi phục lần áp dụng cuối. **Tải Excel mới** tạo file hậu tố
`-da-chinh.xlsx`; không ghi đè file gốc. Bộ xuất sửa ZIP/XML gốc để giữ styles, ảnh,
tiêu đề, ô gộp, thiết lập in, công thức tổng và sheet bổ sung. Cập nhật tổng ngày đã
nhận diện, giữ quy ước tổng có/không có chào cờ và yêu cầu Excel tính lại khi mở.
Sheet đang bảo vệ hoặc workbook có chữ ký số sẽ bị từ chối xuất.

## File Excel được hỗ trợ

- `.xlsx` tối đa 20 MB; cần năm sheet lịch Thứ Hai–Sáu.
- Nhận thứ qua tên sheet (`THỨ HAI`, `Thứ 2`, `T2`…) hoặc tiêu đề nội dung.
- Header `Môn` / `Tên GV` tại A/B trong 30 dòng đầu, bốn tiết sáng và ba tiết chiều.
  Thứ Tư nhận cả mẫu chỉ sáng và mẫu có chiều; giới hạn giáo viên Thứ Tư vẫn là 4 tiết/ngày.
- Hỗ trợ tên gộp A:B; từ chối tên giáo viên trùng, ô lịch gộp, công thức hoặc lỗi Excel.
- Nhận lớp có tiền tố HĐTN, CN, TNXH, TCTV, TCT, LTT, LTTV, ĐĐ.
- Cột tổng và bảng tổng hợp là tùy chọn, nhận theo nội dung; không tự thêm khi thiếu.
- Sheet lưu trữ (`CŨ`, `OLD`, `BACKUP`, `LƯU`) được giữ lại và không dùng kiểm tra.

Không suy đoán mọi bố cục Excel tùy ý; thứ, giáo viên, buổi và tiết cần nhận diện được.
Chưa đối chiếu lịch giáo viên chủ nhiệm hoặc trùng giáo viên giữa hai file cơ sở.

## Cấu trúc dự án

```text
index.html               Trang chính
src/                     Mã ứng dụng
  parser.js              Đọc và chuẩn hóa Excel
  rules.js               Bốn quy tắc, giới hạn dùng chung với solver
  solver.js              Tìm, kiểm tra và áp dụng phương án
  solver-worker.js       Tìm phương án ngoài luồng giao diện
  exporter.js            Sửa gói Excel gốc
  ui.js                  Giao diện và trạng thái phiên
  config.js              Cấu hình truy cập
assets/                  CSS và favicon
vendor/                  Thư viện trình duyệt và giấy phép
scripts/                 Chạy web, build, kiểm thử thực tế
tests/                   Kiểm thử tự động
docs/                    Hướng dẫn kiểm thử và lịch sử
dist/                    Website đã build, được sinh tự động
.tmp/                    Kết quả kiểm thử cục bộ, không công bố
```

`scripts/web-files.mjs` là danh sách chung cho máy chủ và build. Máy chủ chỉ phục vụ
các tệp web được liệt kê, không phục vụ dữ liệu kiểm thử, Excel hoặc mã kiểm thử.

## Kiểm thử và đóng gói

```powershell
npm ci
npm test
npm run build
```

Nếu môi trường chặn tiến trình con, dùng `node --test --test-isolation=none`.
Xem [các bước và kết quả kiểm thử](docs/verification.md) để chạy với file thực tế,
Chrome và Excel trên Windows. Dữ liệu trường học không nằm trong Git hoặc `dist/`.

Workflow **Publish website** tại `.github/workflows/` triển khai `dist/` lên GitHub
Pages khi chạy thủ công. Bản cập nhật này đang được phục vụ trên máy để người dùng
test; chưa công bố bản mới ra Internet.
