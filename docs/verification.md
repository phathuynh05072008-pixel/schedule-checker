# Kiểm thử ngày 03/10/2026

## Kết quả kiểm tra và chỉnh sửa file thực tế

| File | Giáo viên | Tiết chuyên | Vi phạm trước | Thay đổi (gồm đổi chỗ) | Vi phạm sau xuất/đọc lại |
| --- | ---: | ---: | ---: | ---: | ---: |
| TKB L2 GV CHUYÊN PHÂN HIỆU NH 26-27 | 11 | 122 | 7 | 6 (1 đổi chỗ) | 0 |
| TKB GV CHUYÊN NH 26-27 | 24 | 454 | 15 | 14 (3 đổi chỗ) | 0 |
| TKB L2 GVCHUYÊN ĐIỂM CHÍNH NH 26-27 | 18 | 337 | 51 | 32 (11 đổi chỗ) | 0 |

Bản gốc không thay đổi: đã đối chiếu SHA-256 trước/sau. Bản xuất giữ số tiết và
tập tiết/nội dung hoạt động của từng giáo viên, chào cờ, sheet lưu trữ và styles.
Đã kiểm tra bằng đối chiếu độc lập các giới hạn 1–3–2–3–2, chiều 2, trùng lớp và
tiết liền nhau của từng giáo viên. File 454 tiết vẫn có cảnh báo gốc
`THỨ HAI!G18 = II`; giữ nguyên để người dùng kiểm tra thủ công.

33/33 kiểm thử Node đạt khi bật đủ ba biến môi trường dữ liệu thực tế; không bỏ qua test.
Bao gồm liền tiết 2/3 tiết, xen lớp/ô trống, phân biệt giáo viên/buổi, đổi chỗ,
phương án cũ, lỗi mới, môn khác, batch thất bại không sửa bản gốc,
chiều thứ Tư, export/reopen và so sánh cấu trúc XML/định dạng.

Chrome đạt luồng đăng nhập đúng/sai, chọn file, kiểm tra, bộ lọc, tìm giáo viên,
xem trước không thay đổi dữ liệu, áp dụng riêng, áp dụng tất cả, hoàn tác, tải Excel,
file hỏng/thiếu sheet, thay file không giữ gợi ý cũ, đăng xuất và tải lại trang.
Đã kiểm tra ở 1440/768/390 px, không tràn ngang trang; không có lỗi console hoặc
request ra ngoài website. L2 đã kiểm tra preview đổi chỗ và kế hoạch về 0.
Mẫu riêng `1A–2A–1A–1A` được sửa thành `2A–1A–1A–1A` bằng đổi chỗ,
hoàn tác và tải/đọc lại đạt; mẫu có chiều thứ Tư được kiểm tra và sửa đúng mức 2 tiết/lớp.

Excel 16.0 mở cả ba bản xuất và tính lại công thức thành công: đối chiếu tổng cộng
2.058 giá trị ô lịch/tổng và 304 vị trí định dạng trên 19 sheet. File gốc không lưu.

## Chạy lại với dữ liệu thực tế

```powershell
$taskSamples = 'C:\Users\phattruong\Downloads\code'
$env:TKB_SAMPLE_XLSX = "$taskSamples\TKB GV CHUYÊN  NH 26-27.xlsx"
$env:TKB_L2_DIR = $taskSamples
python scripts/extract-reference.py $env:TKB_SAMPLE_XLSX .tmp/reference.json
$env:TKB_REFERENCE_JSON = "$PWD/.tmp/reference.json"
node --test --test-isolation=none
node scripts/check-real-workbooks.mjs $taskSamples
```

`check-real-workbooks.mjs` kiểm tra mọi `.xlsx` trong thư mục mẫu và tạo bản xuất,
giá trị kỳ vọng cho Excel và báo cáo JSON tại `.tmp/real-workbooks/`.
Không dùng một thư mục chứa file Excel không liên quan.

## Chrome

Khởi động `npm start` trước. Cần Chrome và Playwright. Thay đường dẫn packages bằng
runtime có Playwright của máy đang dùng.

```powershell
$taskPackages = 'C:\Users\phattruong\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node scripts/check-browser.mjs $taskPackages $env:TKB_SAMPLE_XLSX
node scripts/check-l2-browser.mjs $taskPackages $taskSamples
node scripts/check-blocks-browser.mjs $taskPackages
```

Ảnh và báo cáo được lưu trong `.tmp/browser/`; không nằm trong website công bố.

## Excel thật trên Windows

Sau khi chạy `check-real-workbooks.mjs`, mở từng bản xuất và tính lại toàn bộ công thức
bằng Excel COM. File gốc và bản xuất đều mở chỉ đọc, không lưu.

```powershell
$taskReports = Get-Content .tmp/real-workbooks/report.json -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($taskReport in $taskReports) {
  ./scripts/check-excel.ps1 -OriginalPath $taskReport.source -ExportedPath $taskReport.exported -ExpectedPath $taskReport.expectedPath
}
```

Script đối chiếu định dạng/ô gộp/font trên từng sheet, sau đó kiểm tra tất cả ô lịch
và tổng đã nhận diện với giá trị kỳ vọng sau khi Excel tính lại. Kết quả chỉ xác nhận
phiên bản Excel đang cài trên máy, chưa bao phủ mọi phiên bản Excel/LibreOffice.
