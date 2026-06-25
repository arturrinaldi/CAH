$json = Get-Content 'cah-all-full-pt.json' -Raw | ConvertFrom-Json
Write-Host "Total packs: $($json.Count)"
for($i=0; $i -lt $json.Count; $i++) {
    $p = $json[$i]
    $wc = if($p.white) { $p.white.Count } else { 0 }
    $bc = if($p.black) { $p.black.Count } else { 0 }
    Write-Host "Pack $i : $($p.name) | White: $wc | Black: $bc"
    if($bc -gt 0) {
        Write-Host "  Black[0]: $($p.black[0] | ConvertTo-Json -Compress)"
    }
}
