# Lịch sử trước bản cập nhật 03/10/2026

Tài liệu lưu kết quả và thiết kế ngày 19–21/09/2026. Các đường dẫn, số quy tắc và
số lỗi bên dưới thuộc phiên bản cũ; xem README và verification.md cho bản hiện hành.

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
   Phương án ưu tiên tự xuất hiện dưới từng lỗi khi tìm xong, kèm vị trí chuyển cụ thể.
   Chỉ khi nhấn **Xác nhận áp dụng** lịch mới thay đổi. Sau khi sửa hoặc hoàn tác, gợi ý được tính lại.
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
HĐTN, CN, TNXH, TCTV, TCT, LTT, LTTV, ĐĐ; nhận cả `ĐĐ4A` không có khoảng trắng.
Ô chưa rõ lớp vẫn tính vào số tiết giáo viên nhưng không suy đoán tên lớp cho luật 1/3.
Ngoại lệ: `CC phân hiệu` hoặc `CC` tại tiết 1 sáng Thứ Hai là chào cờ chung, không tính vào
số tiết chuyên của giáo viên hoặc thống kê tiết chuyên trong tuần. Ô này được giữ
nguyên, không báo chưa rõ lớp và không tự động chuyển. Solver không xếp tiết chuyên
vào tiết 1 sáng Thứ Hai, kể cả khi ô của giáo viên đang trống.
Tổng sẵn có trong Excel có thể gồm chào cờ hoặc chỉ gồm tiết chuyên; parser nhận
cả hai cách tính và phần xuất giữ cách tính của ô tổng gốc. Số tiết trên web luôn
loại chào cờ. Cụm từ này ở vị trí khác vẫn cần kiểm tra thủ công.
Nếu còn ô chưa rõ, kết quả không khẳng định toàn bộ lịch hợp lệ.

## Cấu trúc file và giới hạn

- Cần năm sheet lịch Thứ Hai đến Thứ Sáu. Nhận tên có khoảng trắng/chữ thường/Unicode
  khác cách mã hóa, `T2`–`T6`, `Thứ 2`–`Thứ 6`; hoặc nhận thứ qua tiêu đề cột A nếu tên tab khác.
- Tự tìm header Môn/Tên GV trong 30 dòng đầu; header buổi và tiết vẫn cần đúng cấu trúc.
  Thứ Tư chỉ có bốn tiết sáng.
- Môn ở A, tên giáo viên ở B; hỗ trợ tên gộp A:B trên một dòng như file mẫu.
- Cột tổng ngày được tìm trong 5 cột ngay sau lịch, chỉ khi xác định được một cột.
  Thiếu cột tổng không chặn kiểm tra; web tự đếm và không tự thêm cột khi xuất.
- Bảng tổng hợp là tùy chọn, nhận bằng header Tên GV và 5 thứ liên tiếp thay vì tên `Sheet1`.
  Hỗ trợ `Tổng tiết` có header HAI/BA/TƯ/NĂM/SÁU; tên GV ở B, C hoặc D.
  Bảng cũ (`CŨ`, `OLD`, `BACKUP`, `LƯU`) được giữ nguyên, không dùng đối chiếu hoặc cập nhật.
  Thiếu bảng, sai cấu trúc hoặc nhiều bảng không rõ lựa chọn: ghi chú và tiếp tục kiểm tra lịch.
- Sheet bổ sung được giữ lại. Sheet lịch bắt buộc thiếu hoặc không thể đọc an toàn vẫn báo lỗi.
  Không thể nhận diện mọi bố cục Excel tùy ý; bố cục không có giáo viên, thứ, buổi, tiết rõ ràng
  cần được chuẩn hóa trước. Ứng dụng xử lý từng file riêng, chưa đối chiếu trùng lịch giữa hai cơ sở.
- Tên giáo viên trùng trong cùng sheet bị từ chối. Hai người trùng tên nhưng xuất hiện
  ở những ngày khác nhau không thể phân biệt chắc chắn; cần định danh khác nhau trong tên.
- Ô lịch gộp, chứa công thức hoặc lỗi Excel bị từ chối để tránh hiểu sai một tiết.
- Môn để trống khi dòng tên gộp A:B, không tự lấy môn từ dòng trước.

## Tìm phương án và giữ file Excel

`solver.js` xét tất cả cách chuyển một tiết sang ô trống hợp lệ cho từng lỗi, xếp hạng
theo mức giảm vi phạm (tổng `actual - limit`) lớn nhất, rồi cùng buổi/cùng ngày,
khoảng cách ngày và khoảng cách tiết nhỏ nhất. Trả tối đa 3 phương án, phương án đầu
hiển thị ngay khi kiểm tra. Đây là tối ưu trong các cách chuyển một tiết theo tiêu chí
này, không bảo đảm tối ưu toàn cục hay các ràng buộc chưa được cung cấp.
Chỉ chuyển tiết đã nhận diện được lớp, giữ nguyên giáo viên và
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
Các tổng ngày và tổng ngày trên bảng tổng hợp đã nhận diện được cập nhật cả giá trị cache,
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

### Cập nhật 21/09/2026

Hai file L2 đã được kiểm tra trực tiếp: phân hiệu có 11 giáo viên, 122 tiết chuyên,
không có lỗi theo 3 luật; điểm chính có 18 giáo viên, 337 tiết và 31 vi phạm.
31 vi phạm đều có phương án chuyển một tiết hợp lệ ở trạng thái ban đầu. Gợi ý của
các lỗi không được áp dụng độc lập cùng lúc; hệ thống luôn kiểm tra lại sau mỗi lần sửa.
Đã kiểm tra xuất/đọc lại khi không có tổng, giữ nguyên sheet CŨ/Sheet2 và styles,
đổi tên sheet lịch, cập nhật đúng bảng Tổng tiết khi chuyển tiết qua ngày khác.
Kiểm thử Chrome xác minh hai file, gợi ý trực tiếp, xác nhận áp dụng, thay file không
giữ gợi ý cũ và màn hình 390 px không tràn ngang.

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
