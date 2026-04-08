# Create a temporary self-signed code signing certificate for local Khadim testing.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\src-tauri\create-dev-cert.ps1

param(
    [string]$Subject = "CN=Unravel AI",
    [string]$Password = "change-me",
    [string]$OutputPath = "code-sign-dev.pfx",
    [int]$ValidYears = 1
)

$cert = New-SelfSignedCertificate -Type CodeSigningCert `
    -Subject $Subject `
    -KeyUsage DigitalSignature `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears($ValidYears)

$securePassword = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $OutputPath -Password $securePassword | Out-Null

Write-Host "Created dev code-signing certificate."
Write-Host "PFX: $OutputPath"
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host ""
Write-Host "Set bundle.windows.certificateThumbprint in src-tauri/tauri.conf.json for local signed builds."
Write-Host "Use this certificate for local testing only; public installs still need a trusted cert."
