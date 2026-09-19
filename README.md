# Kiểm tra thời khóa biểu giáo viên chuyên

Web tiếng Việt chạy hoàn toàn trên trình duyệt, dành cho văn phòng nhà trường.
Đã có đủ luồng đăng nhập, tải Excel, kiểm tra 3 luật, xem lịch theo ngày, tìm phương án
chỉnh sửa, xác nhận từng phương án hoặc cả danh sách, hoàn tác và tải Excel mới.

## Chạy trên máy

Yêu cầu Node.js 24. Các thư viện trình duyệt đã nằm trong `vendor/`, nên mở web không
cần kết nối CDN hoặc cài lại thư viện.

```powershell
cd C:\schedule-checker
npm start
```

Mở địa chỉ in trong terminal, mặc định `http://127.0.0.1:5173`.
Nếu cổng đã dùng, máy chủ chọn cổng tiếp theo. Máy chủ chỉ phục vụ các tệp web được
liệt kê, không phục vụ `.tmp/`, file Excel, mã kiểm thử hoặc thư mục tải xuống.
Không mở `index.html` bằng `file://` vì ứng dụng dùng ES modules và Web Worker.

**Mật khẩu ban đầu: `TKB@2026`**. Thay `ACCESS_PASSWORD` trong `config.js` rồi tải lại web.
Khi đổi mật khẩu, đăng xuất các phiên đang mở để kiểm tra mật khẩu mới.

Đây chỉ là rào chắn phía client, không phải cơ chế bảo mật tài khoản. Mật khẩu nằm
trong mã nguồn và có thể bị xem hoặc bỏ qua bởi người biết kỹ thuật. Không sử dụng
mật khẩu thật của tài khoản cá nhân hoặc tài khoản nhà trường.
`sessionStorage` chỉ giữ cờ đăng nhập; dữ liệu lịch và bản gốc chỉ tồn tại trong bộ nhớ.
Đăng xuất hoặc tải lại trang xóa dữ liệu lịch. Không dùng `localStorage`, phân tích
người dùng hay gửi file lên máy chủ. Các tài nguyên đều được tải từ chính trang web;
CSP chặn kết nối `fetch`, XHR và WebSocket.

## Sử dụng

1. Đăng nhập, chọn hoặc kéo thả một tệp `.xlsx` (tối đa 20 MB).
2. Nhấn **Kiểm tra**. Xem lỗi theo loại hoặc theo thứ, cùng ô Excel và giáo viên liên quan.
3. Mở **Lịch theo ngày** để xem lịch và tìm giáo viên/môn. Ô lỗi, ô chưa rõ lớp và ô
   đã thay đổi có đánh dấu riêng.
4. Nhấn **Chỉnh sửa** để xem tối đa 3 cách chuyển một tiết cho mỗi vi phạm.
   Chưa có thay đổi nào được áp dụng khi chỉ mở cửa sổ này.
5. Xác nhận từng phương án hoặc **Áp dụng tất cả gợi ý**. Danh sách áp dụng tất cả
   hiển thị riêng ở cuối cửa sổ, được tính tuần tự trên cùng một lịch để không xung đột.
6. Hệ thống kiểm tra lại sau mỗi lần sửa. Có thể hoàn tác lần cuối tại **Thay đổi**.
7. Nhấn **Tải Excel mới** để tải bản có hậu tố `-da-chinh.xlsx`. File gốc không bị ghi đè.
   Bản tải có thể còn cảnh báo hoặc lỗi chưa sửa; ứng dụng vẫn hiển thị rõ số lượng.

## Ba quy tắc

| Quy tắc | Điều kiện |
| --- | --- |
| Trùng lớp | Một lớp chỉ xuất hiện một lần tại cùng thứ, buổi, tiết. |
| Tiết giáo viên/ngày | Tối đa Thứ Hai 6, Thứ Ba 7, Thứ Tư 4, Thứ Năm 7, Thứ Sáu 6. |
| Tiết lớp/buổi | Tối đa 3 tiết sáng, 2 tiết chiều; đếm mọi lần xuất hiện kể cả trùng tiết. |

Tên giáo viên được chuẩn hóa NFC, khoảng trắng và khóa chữ hoa. Tiền tố lớp gồm
HĐTN, CN, TNXH, TCTV, TCT, ĐĐ; nhận cả `ĐĐ4A` không có khoảng trắng.
Ô chưa rõ lớp vẫn tính vào số tiết giáo viên nhưng không suy đoán tên lớp cho luật 1/3.
Ngoại lệ: `CC phân hiệu` tại tiết 1 sáng Thứ Hai là chào cờ chung, không tính vào
số tiết chuyên của giáo viên hoặc thống kê tiết chuyên trong tuần. Ô này được giữ
nguyên, không báo chưa rõ lớp và không tự động chuyển. Solver không xếp tiết chuyên
vào tiết 1 sáng Thứ Hai, kể cả khi ô của giáo viên đang trống.
Tổng sẵn có trong Excel có thể gồm chào cờ hoặc chỉ gồm tiết chuyên; parser nhận
cả hai cách tính và phần xuất giữ cách tính của ô tổng gốc. Số tiết trên web luôn
loại chào cờ. Cụm từ này ở vị trí khác vẫn cần kiểm tra thủ công.
Nếu còn ô chưa rõ, kết quả không khẳng định toàn bộ lịch hợp lệ.

## Cấu trúc file và giới hạn

- Cần năm sheet `THỨ HAI`, `THỨ BA`, `THỨ TƯ`, `THỨ NĂM`, `THỨ SÁU` và `Sheet1`.
- Header lịch ở dòng 7–8, dữ liệu từ dòng 9. Thứ Tư chỉ có bốn tiết sáng.
- Môn ở A, tên giáo viên ở B; hỗ trợ tên gộp A:B trên một dòng như file mẫu.
- Tổng ngày ở K, riêng Thứ Tư ở H. `Sheet1` có tên ở C hoặc gộp B:C, tổng ngày D:H,
  tổng tuần I. Đây là định dạng cụ thể của mẫu đã cung cấp, không phải trình đọc mọi mẫu TKB.
- Sheet bổ sung được giữ lại. Sheet thiếu hoặc sai header được báo lỗi.
- Tên giáo viên trùng trong cùng sheet bị từ chối. Hai người trùng tên nhưng xuất hiện
  ở những ngày khác nhau không thể phân biệt chắc chắn; cần định danh khác nhau trong tên.
- Ô lịch gộp, chứa công thức hoặc lỗi Excel bị từ chối để tránh hiểu sai một tiết.
- Môn để trống khi dòng tên gộp A:B, không tự lấy môn từ dòng trước.

## Tìm phương án và giữ file Excel

`solver.js` triển khai heuristic chuyển một tiết sang ô trống: ưu tiên cùng buổi/cùng
ngày trước ngày khác. Chỉ chuyển tiết đã nhận diện được lớp, giữ nguyên giáo viên và
nội dung hoạt động; không giả định giáo viên thiếu trong sheet là rảnh. Không chọn
tiết đích nếu có ô chưa rõ lớp ở cùng thời điểm. Mỗi phương án phải giảm mức vi phạm
và không tạo lỗi mới hoặc làm nặng thêm lỗi cũ qua chính `runRules`.

Danh sách áp dụng tất cả được kiểm tra tuần tự; tối đa 100 lượt chuyển và tìm kiếm
trong Web Worker có giới hạn 30 giây trên giao diện. Chưa triển khai backtracking
hay hoán đổi các ô có lịch. Nếu không tìm được vị trí hợp lệ bằng chuyển trực tiếp,
web báo cần điều chỉnh thủ công trong Excel. Không bảo đảm tìm được mọi lời giải.

Phạm vi chỉ gồm lịch giáo viên chuyên và ba luật trên. Chưa biết lịch giáo viên chủ
nhiệm, phòng học hay các tiết cố định ngoài dữ liệu; người dùng cần đối chiếu trước
khi chốt lịch. Các ô cảnh báo không được tự động sửa hoặc đoán nghĩa.

SheetJS 0.20.3 đọc và kiểm tra workbook. Phần xuất dùng `fflate` và XML DOM để sửa
trực tiếp các ô lịch trong gói XLSX gốc, tránh việc ghi lại toàn workbook làm mất
các định dạng mà SheetJS Community không bảo đảm giữ nguyên.
Giữ phần styles, ảnh, đối tượng, tiêu đề, merge, thiết lập in và các phần không sửa.
Các tổng ngày và tổng ngày trên `Sheet1` liên quan được cập nhật cả giá trị cache,
giữ công thức có sẵn. Tổng tuần không đổi vì tiết vẫn thuộc cùng giáo viên.
Đặt yêu cầu Excel tính lại công thức khi mở. Phần ZIP được nén lại nên byte của
toàn file khác, nhưng nội dung các phần không liên quan được giữ nguyên từng byte.
File có chữ ký số hoặc sheet cần sửa đang được bảo vệ sẽ bị từ chối xuất.

## Kiến trúc

| Tệp | Vai trò |
| --- | --- |
| `parser.js` | Đọc Excel, chuẩn hóa và cảnh báo cấu trúc/dữ liệu. |
| `rules.js` | Ba hàm luật thuần và `runRules(data, rules)`. |
| `solver.js` | Tìm phương án, tái kiểm tra, áp dụng trên bản sao. |
| `solver-worker.js` | Chạy tìm kiếm ngoài luồng giao diện. |
| `exporter.js` | Cập nhật giá trị trong gói Excel gốc. |
| `ui.js`, `index.html`, `styles.css` | Giao diện và trạng thái phiên. |
| `config.js` | Mật khẩu truy cập cơ bản. |
| `vendor/` | SheetJS, fflate, Lucide và giấy phép; không gọi CDN. |

`parseWorkbook` trả `{schemaVersion, days, summary, warnings, stats}`.
`readExcelFile`/`readExcelBytes` trả `{fileName, originalBytes, workbook, data}`.
Mỗi `day` có `rows`, `slots`; mỗi row có tên/khóa giáo viên, môn, dòng Excel và `lessons`.
Mỗi lesson có ô, dòng, cột, buổi, tiết, nội dung gốc, lớp, hoạt động và loại dữ liệu.

Để thêm luật, viết một hàm thuần nhận `day`, trả mảng vi phạm rồi thêm vào `RULES`.
Mỗi vi phạm cần ID ổn định, mã `rule`, `severity`, `day`, `actual`, `limit`, `lessons`,
`message`, `suggestion`; các trường lớp/GV/buổi/tiết không áp dụng là `null`.
Mức vi phạm của solver là `actual - limit`, dương khi vi phạm; nếu luật mới không
theo mô hình này cần mở rộng hàm đánh giá trong solver trước khi dùng tự động sửa.
Thêm nhãn vào `labels` và bộ lọc giao diện, cùng test có/không có lỗi. Không sửa parser
trừ khi luật mới cần dữ liệu bổ sung.

## Kiểm thử

Cài dependencies chỉ cần cho phát triển, chuẩn bị lại vendor hoặc chạy tests:

```powershell
npm ci --offline=false --cache .tmp/npm-cache
npm run prepare:vendor
npm test
```

Nếu môi trường chặn tiến trình con: `node --test --test-isolation=none`.
Các test mẫu thực tế được bỏ qua nếu không chỉ định file, để không đưa dữ liệu trường
học vào repository. Chạy đủ test với file mẫu đã cung cấp:

```powershell
New-Item -ItemType Directory -Force .tmp
python scripts/extract-reference.py "duong-dan-file-mau.xlsx" .tmp/reference.json
$env:TKB_REFERENCE_JSON = "$PWD/.tmp/reference.json"
$env:TKB_SAMPLE_XLSX = "duong-dan-file-mau.xlsx"
node --test --test-isolation=none
npm run inspect -- "duong-dan-file-mau.xlsx"
```

Kiểm thử giao diện cần Playwright và Chrome được cài trên máy; công cụ chấp nhận
đường dẫn thư mục `node_modules` có Playwright:

```powershell
node scripts/check-browser.mjs "duong-dan-node_modules" "duong-dan-file-mau.xlsx" "http://127.0.0.1:5173"
```

Trên Windows có Excel, kiểm tra bản xuất từ test trình duyệt bằng Excel thật,
chỉ mở đọc và không lưu file gốc:

```powershell
./scripts/check-excel.ps1 -OriginalPath "duong-dan-file-mau.xlsx" -ExportedPath ".tmp/browser/exported.xlsx"
```

### Kết quả ngày 19/09/2026

- 24/24 test đạt, gồm đọc trực tiếp bằng SheetJS, luật, solver, xuất và đọc lại file.
- Mẫu: 24 giáo viên, 454 tiết chuyên và một ô chào cờ; tổng tiết chuyên Thứ Hai–Sáu
  là 75, 115, 59, 122, 83. Trần Hồng Điệp có 6 tiết chuyên vào Thứ Hai, không vượt giới hạn.
- Một lỗi: lớp 2H có 3 tiết chiều Thứ Năm tại G32, H12, I9.
- Solver tìm được một thay đổi, đưa vi phạm về 0, vẫn giữ cảnh báo `THỨ HAI!G18 = II`.
  Chào cờ `THỨ HAI!C24` giữ nguyên. Tổng tuần và tập các tiết của từng giáo viên không đổi.
- So sánh các phần ZIP, XML: styles và các phần không liên quan giữ nguyên; các ô gộp,
  cấu trúc sheet, thuộc tính định dạng, công thức và dòng tiêu đề được kiểm tra.
- Chrome: đăng nhập đúng/sai, tải file, lọc lỗi, xem lịch, tìm giáo viên, preview,
  áp dụng từng phương án/tất cả, hoàn tác, tải file, file hỏng/thiếu sheet, đăng xuất
  và tải lại trang đạt. Không có lỗi console hoặc request ngoài địa chỉ web.
- Kiểm tra ảnh màn hình ở 1440, 768, 390 px; trang không tràn ngang. Bảng lịch có vùng cuộn riêng.
- Excel 16.0 mở bản xuất và tính lại thành công; kiểm tra 96 vị trí định dạng trên 6 sheet.
  Không lưu thay đổi vào file gốc. Chưa kiểm thử trên mọi phiên bản Excel hay LibreOffice.

## Đóng gói và GitHub Pages

```powershell
npm run build
```

`dist/` chỉ chứa 16 tệp web/thư viện/giấy phép, không có file Excel hoặc dữ liệu kiểm thử.
Các thư mục `.tmp/`, `node_modules/`, `dist/` và file `.xlsx`, `.xls` được bỏ qua bởi Git.
Không đưa file dữ liệu trường học vào repository bằng lệnh force-add.

1. Tạo repository GitHub và đẩy mã ứng dụng, bao gồm `vendor/`, lên repository đó.
2. Trong cài đặt Pages của repository, chọn nguồn GitHub Actions.
3. Chạy workflow **Publish website** từ tab Actions. Workflow đóng gói `dist/` và
   triển khai lên Pages; địa chỉ xuất hiện trong kết quả deployment.
4. Khi cập nhật mã, đẩy thay đổi rồi chạy workflow lại. Workflow chỉ chạy thủ công,
   không tự công bố mỗi khi push.

Chưa đẩy mã hoặc công bố website ra Internet trong phiên thực hiện này.
Máy chủ chạy local chỉ lắng nghe trên máy hiện tại; muốn dùng trên 5 máy văn phòng,
có thể triển khai Pages để mỗi người mở cùng địa chỉ và tự chọn file trên máy mình.
