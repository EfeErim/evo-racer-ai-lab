$ErrorActionPreference = "Stop"

# Fails when a tracked document cites a docs/ path or Markdown link that does not exist.
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repoRoot

try {
    $documents = git ls-files --cached --exclude-standard -- "*.md" "package.json" | Where-Object { $_ -notlike "docs/prompts/*" }
    $dangling = [System.Collections.Generic.List[string]]::new()

    foreach ($document in $documents) {
        $content = [System.IO.File]::ReadAllText((Join-Path $repoRoot $document))
        $directory = Split-Path -Parent $document

        foreach ($match in [regex]::Matches($content, '(?<![\w/.-])docs/(?!prompts/)[A-Za-z0-9._/-]+\.md')) {
            if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $match.Value))) {
                $dangling.Add("${document}: $($match.Value)")
            }
        }

        foreach ($match in [regex]::Matches($content, '\]\((?!https?:|#|mailto:)([^)#\s]+)(#[^)\s]*)?\)')) {
            $target = Join-Path (Join-Path $repoRoot $directory) $match.Groups[1].Value
            if (-not (Test-Path -LiteralPath $target)) {
                $dangling.Add("${document}: $($match.Groups[1].Value)")
            }
        }
    }

    if ($dangling.Count -gt 0) {
        $dangling | ForEach-Object { Write-Host "Dangling reference: $_" }
        throw "$($dangling.Count) dangling documentation reference(s)."
    }
    Write-Host "Checked $($documents.Count) documents; zero dangling references."
}
finally {
    Pop-Location
}
