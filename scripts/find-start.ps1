Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'next start' } |
  ForEach-Object { "{0}`t{1}" -f $_.ProcessId, $_.CommandLine }
