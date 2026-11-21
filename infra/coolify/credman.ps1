# Windows Credential Manager access without extra modules: CredRead and CredWrite from advapi32 through Add-Type.
# Dot-sourced by tofu.ps1 and credentials.ps1. Entries are generic credentials named "teammanix/<name>", visible in
# Control Panel, Credential Manager, Windows Credentials. Windows protects them with the key of the current user.

if (-not ('TeamManixCredMan' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class TeamManixCredMan {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref CREDENTIAL credential, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredDelete(string target, uint type, uint flags);
  [DllImport("advapi32.dll")]
  static extern void CredFree(IntPtr buffer);

  const uint Generic = 1;
  const uint PersistLocalMachine = 2;
  const int NotFound = 1168;
  const int MaxBlobBytes = 2560;

  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, Generic, 0, out p)) {
      if (Marshal.GetLastWin32Error() == NotFound) return null;
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      return Marshal.PtrToStringUni(c.CredentialBlob, (int)c.CredentialBlobSize / 2);
    } finally {
      CredFree(p);
    }
  }

  public static void Write(string target, string userName, string secret) {
    int size = secret.Length * 2;
    if (size > MaxBlobBytes) throw new ArgumentException("Secret too long for the Credential Manager");
    IntPtr blob = Marshal.StringToCoTaskMemUni(secret);
    try {
      CREDENTIAL c = new CREDENTIAL();
      c.Type = Generic;
      c.TargetName = target;
      c.UserName = userName;
      c.CredentialBlobSize = (uint)size;
      c.CredentialBlob = blob;
      c.Persist = PersistLocalMachine;
      if (!CredWrite(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    } finally {
      Marshal.ZeroFreeCoTaskMemUnicode(blob);
    }
  }

  public static bool Delete(string target) {
    if (CredDelete(target, Generic, 0)) return true;
    if (Marshal.GetLastWin32Error() == NotFound) return false;
    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  }
}
'@
}

function Get-CredTarget([string] $Name) { return "teammanix/$Name" }

# The value, or $null when the entry does not exist.
function Get-CredSecret([string] $Name) {
  return [TeamManixCredMan]::Read((Get-CredTarget $Name))
}

function Set-CredSecret([string] $Name, [string] $Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Empty value for '$Name'." }
  [TeamManixCredMan]::Write((Get-CredTarget $Name), 'teammanix', $Value)
}

function Remove-CredSecret([string] $Name) {
  return [TeamManixCredMan]::Delete((Get-CredTarget $Name))
}
