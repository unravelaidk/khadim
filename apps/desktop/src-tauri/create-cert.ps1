# Create a self-signed code signing certificate for testing
# Run this in PowerShell as Administrator

$cert = New-SelfSignedCertificate -Type CodeSigningCert `
    -Subject "CN=Unravel AI" `
    -KeyUsage DigitalSignature `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(5)

# Export to PFX
$password = ConvertTo-SecureString -String "khadim123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "code-sign.pfx" -Password $password

Write-Host "Certificate created and exported to code-sign.pfx"
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host ""
Write-Host "To trust on another machine, export the .cer (not .pfx) and import it to Trusted Root CA"
