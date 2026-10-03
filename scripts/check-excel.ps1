param([Parameter(Mandatory=$true)][string]$OriginalPath, [Parameter(Mandatory=$true)][string]$ExportedPath, [Parameter(Mandatory=$true)][string]$ExpectedPath)
$ErrorActionPreference = 'Stop'
$excelApp = $null
$sourceBook = $null
$exportedBook = $null
try {
  $excelApp = New-Object -ComObject Excel.Application
  $excelApp.Visible = $false
  $excelApp.DisplayAlerts = $false
  $excelApp.AskToUpdateLinks = $false
  $excelApp.AutomationSecurity = 3
  $sourceBook = $excelApp.Workbooks.Open((Resolve-Path -LiteralPath $OriginalPath).Path, 0, $true)
  $exportedBook = $excelApp.Workbooks.Open((Resolve-Path -LiteralPath $ExportedPath).Path, 0, $true)
  if ($sourceBook.Worksheets.Count -ne $exportedBook.Worksheets.Count) { throw 'Sheet count changed.' }
  $checks = 0
  for ($i = 1; $i -le $sourceBook.Worksheets.Count; $i++) {
    $sourceSheet = $sourceBook.Worksheets.Item($i)
    $exportedSheet = $exportedBook.Worksheets.Item($i)
    if ($sourceSheet.Name -ne $exportedSheet.Name) { throw 'Sheet name changed.' }
    foreach ($address in @('A1', 'A2', 'A3', 'A4', 'A5', 'A7', 'B7', 'C7', 'A9', 'B9', 'C24', 'D24', 'G24', 'K24', 'C32', 'G32')) {
      $a = $sourceSheet.Range($address)
      $b = $exportedSheet.Range($address)
      foreach ($property in @('Style', 'NumberFormat', 'ColumnWidth', 'RowHeight', 'HorizontalAlignment', 'VerticalAlignment', 'WrapText')) {
        if ([string]$a.$property -ne [string]$b.$property) { throw "Formatting changed at sheet $i cell $address property $property" }
      }
      if ($a.MergeArea.Address() -ne $b.MergeArea.Address()) { throw "Merge changed at $address" }
      if ($a.Font.Name -ne $b.Font.Name -or $a.Font.Size -ne $b.Font.Size -or $a.Font.Color -ne $b.Font.Color) { throw "Font changed at $address" }
      $checks++
    }
  }
  $excelApp.CalculateFullRebuild()
  $taskExpected = Get-Content -LiteralPath $ExpectedPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $taskValueChecks = 0
  foreach ($taskSheet in $taskExpected) {
    $taskWorksheet = $exportedBook.Worksheets.Item($taskSheet.name)
    foreach ($taskCell in $taskSheet.cells.PSObject.Properties) {
      $taskActual = $taskWorksheet.Range($taskCell.Name).Value2
      if ([string]$taskActual -cne [string]$taskCell.Value) { throw "Recalculated value differs: $($taskSheet.name)!$($taskCell.Name): expected '$($taskCell.Value)', actual '$taskActual'" }
      $taskValueChecks++
    }
  }
  [pscustomobject]@{ passed = $true; excelVersion = $excelApp.Version; sheets = $exportedBook.Worksheets.Count; formattingSamples = $checks; valueChecks = $taskValueChecks; nativeRecalculation = 'passed'; sourceSaved = $false } | ConvertTo-Json
} finally {
  if ($exportedBook) { $exportedBook.Close($false) }
  if ($sourceBook) { $sourceBook.Close($false) }
  if ($excelApp) { $excelApp.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excelApp) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
