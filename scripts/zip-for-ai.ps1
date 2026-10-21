param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

try {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $root = (Resolve-Path -LiteralPath $ProjectRoot).ProviderPath.TrimEnd('\', '/')
    $outputPath = Join-Path $root ('brewlite-ai-{0}.zip' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
    $excludedDirectories = @(
        '.git', 'node_modules', '.next', 'dist', 'coverage',
        'build', 'out', '.vercel', '.turbo', '.cache'
    )
    $directories = New-Object 'System.Collections.Generic.Stack[string]'
    $directories.Push($root)
    $fileCount = 0
    $created = $false
    $stream = $null
    $archive = $null

    Write-Host 'Creating source ZIP for AI...'

    try {
        $stream = [System.IO.File]::Open(
            $outputPath, [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write, [System.IO.FileShare]::None
        )
        $created = $true
        $archive = [System.IO.Compression.ZipArchive]::new(
            $stream, [System.IO.Compression.ZipArchiveMode]::Create, $true
        )

        while ($directories.Count -gt 0) {
            foreach ($item in (Get-ChildItem -LiteralPath $directories.Pop() -Force)) {
                $relativePath = $item.FullName.Substring($root.Length + 1).Replace('\', '/')

                # Do not follow links outside the project or into excluded folders.
                if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                    continue
                }

                if ($item.PSIsContainer) {
                    if ($item.Name -notin $excludedDirectories -and $relativePath -ne 'backend/src/generated') {
                        $directories.Push($item.FullName)
                    }
                    continue
                }

                # Keep the environment template, but exclude real environment files.
                if (($item.Name -eq '.env' -or $item.Name -like '.env.*') -and $item.Name -ne '.env.example') {
                    continue
                }
                if ($item.Name -like '*.zip' -or $item.Name -like '*.tsbuildinfo' -or
                    $item.Name -like '*.log' -or $item.Extension -in @('.pem', '.key', '.pfx', '.p12')) {
                    continue
                }

                [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive, $item.FullName, ('brewlite/' + $relativePath),
                    [System.IO.Compression.CompressionLevel]::Optimal
                )
                $fileCount++
            }
        }
    }
    catch {
        if ($archive) { $archive.Dispose(); $archive = $null }
        if ($stream) { $stream.Dispose(); $stream = $null }
        if ($created) { Remove-Item -LiteralPath $outputPath -Force }
        throw
    }
    finally {
        if ($archive) { $archive.Dispose() }
        if ($stream) { $stream.Dispose() }
    }

    $sizeMB = [math]::Round((Get-Item -LiteralPath $outputPath).Length / 1MB, 2)
    Write-Host "Done: $fileCount files, $sizeMB MB"
    Write-Host "ZIP: $outputPath"
    exit 0
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
