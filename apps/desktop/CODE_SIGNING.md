# Khadim Desktop - Code Signing Guide

## Why Windows shows `Unknown publisher`

The Windows installer is only trusted when the generated `.exe` or `.msi` is code-signed with a valid certificate. The `publisher` field in `tauri.conf.json` is not enough on its own.

## Local Windows signing

For development testing, create a self-signed certificate on Windows:

Quick option from this repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\src-tauri\create-dev-cert.ps1
```

That script writes a temporary `code-sign-dev.pfx` in `apps/desktop/src-tauri` and prints the thumbprint to copy into `tauri.conf.json` for local signed builds.

```powershell
# Create self-signed code signing certificate
$cert = New-SelfSignedCertificate -Type CodeSigningCert `
    -Subject "CN=Unravel AI" `
    -KeyUsage DigitalSignature `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(5)

# Export to PFX for later reuse
$password = ConvertTo-SecureString -String "change-me" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "C:\path\to\code-sign.pfx" -Password $password

# Copy the thumbprint into tauri.conf.json for local builds
Write-Host "Thumbprint: $($cert.Thumbprint)"
```

Set the thumbprint in `apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_THUMBPRINT_HERE",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.comodoca.com"
    }
  }
}
```

Then build on Windows:

```bash
bun --filter @khadim/desktop build:package
```

## GitHub Actions signing

The desktop build workflows now support optional Windows signing in CI.

Add these repository secrets:

- `WINDOWS_CERTIFICATE`: Base64-encoded `.pfx` certificate contents
- `WINDOWS_CERTIFICATE_PASSWORD`: Password used when exporting the `.pfx`

Generate the base64 payload on Windows with:

```powershell
certutil -encode "C:\path\to\code-sign.pfx" "C:\path\to\code-sign-base64.txt"
```

Copy the contents of `code-sign-base64.txt` into the `WINDOWS_CERTIFICATE` GitHub secret.

On Windows runners, the workflow will:

1. Decode the `.pfx` from the secret.
2. Import it into `Cert:\CurrentUser\My`.
3. Read the imported thumbprint.
4. Inject `bundle.windows.certificateThumbprint` into `apps/desktop/src-tauri/tauri.conf.json` for that CI build.
5. Run the normal Tauri package build.

If the secrets are not present, the Windows build still succeeds but produces an unsigned installer.

## Production certificates

For public distribution, use a trusted code-signing certificate from a provider such as:

- DigiCert
- Sectigo / Comodo
- SSL.com

Notes:

- A self-signed cert is only suitable for local testing.
- OV certificates sign correctly, but SmartScreen reputation may take time to build.
- EV certificates get immediate SmartScreen reputation.
