# Windows counterpart to display-helper.swift with the same CLI contract:
#   status | extend | restore <base64 saved-state JSON>
# Emits one JSON object on stdout; on failure emits {"ok":false,"error":...} and exits 1.
# Uses the Win32 SetDisplayConfig topology API — the same call DisplaySwitch.exe makes —
# so "extend" / "restore to clone" behave exactly like Win+P "Erweitern" / "Duplizieren".
param(
  [Parameter(Mandatory = $true)][ValidateSet('status', 'extend', 'restore')][string]$Command,
  [string]$SavedStateBase64
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class DisplayTopology
{
    // Only the array sizes matter: QueryDisplayConfig needs correctly sized buffers,
    // but no field of these structs is ever read here (topology id is all we consume).
    [StructLayout(LayoutKind.Sequential, Size = 72)]
    public struct PathInfo { }

    [StructLayout(LayoutKind.Sequential, Size = 64)]
    public struct ModeInfo { }

    public const uint QDC_DATABASE_CURRENT = 0x00000004;
    public const uint SDC_APPLY = 0x00000080;
    public const uint SDC_TOPOLOGY_CLONE = 0x00000002;
    public const uint SDC_TOPOLOGY_EXTEND = 0x00000004;

    [DllImport("user32.dll")]
    public static extern int GetDisplayConfigBufferSizes(uint flags, out uint numPaths, out uint numModes);

    [DllImport("user32.dll")]
    public static extern int QueryDisplayConfig(uint flags, ref uint numPaths, [Out] PathInfo[] paths,
        ref uint numModes, [Out] ModeInfo[] modes, out uint topologyId);

    [DllImport("user32.dll")]
    public static extern int SetDisplayConfig(uint numPaths, IntPtr paths, uint numModes, IntPtr modes, uint flags);
}
'@

$TopologyNames = @{ 1 = 'internal'; 2 = 'clone'; 4 = 'extend'; 8 = 'external' }

function Get-DisplayStatus {
  $numPaths = [uint32]0
  $numModes = [uint32]0
  $result = [DisplayTopology]::GetDisplayConfigBufferSizes(
    [DisplayTopology]::QDC_DATABASE_CURRENT, [ref]$numPaths, [ref]$numModes)
  if ($result -ne 0) { throw "GetDisplayConfigBufferSizes failed: $result" }

  $paths = New-Object 'DisplayTopology+PathInfo[]' ([Math]::Max(1, $numPaths))
  $modes = New-Object 'DisplayTopology+ModeInfo[]' ([Math]::Max(1, $numModes))
  $topologyId = [uint32]0
  $result = [DisplayTopology]::QueryDisplayConfig(
    [DisplayTopology]::QDC_DATABASE_CURRENT, [ref]$numPaths, $paths, [ref]$numModes, $modes, [ref]$topologyId)
  if ($result -ne 0) { throw "QueryDisplayConfig failed: $result" }

  $topology = $TopologyNames[[int]$topologyId]
  if (-not $topology) { $topology = 'unknown' }
  $isClone = $topology -eq 'clone'

  # One entry per active path (= per attached monitor in the current topology).
  # main.cjs only consumes ok / displays.length / displays[].isMirrored; ids and
  # bounds are placeholders kept for shape parity with the macOS helper.
  $displays = @()
  for ($i = 0; $i -lt $numPaths; $i++) {
    $displays += [ordered]@{
      id         = $i
      isMain     = ($i -eq 0)
      isMirrored = ($isClone -and $i -gt 0)
      mirrorOfID = if ($isClone -and $i -gt 0) { 0 } else { $null }
      bounds     = [ordered]@{ x = 0; y = 0; width = 0; height = 0 }
    }
  }

  [ordered]@{ ok = $true; topology = $topology; displays = $displays }
}

function Set-Topology([uint32]$topologyFlag, [string]$label) {
  $result = [DisplayTopology]::SetDisplayConfig(
    0, [IntPtr]::Zero, 0, [IntPtr]::Zero, [DisplayTopology]::SDC_APPLY -bor $topologyFlag)
  if ($result -ne 0) { throw "SetDisplayConfig($label) failed: $result" }
}

function Invoke-Extend {
  $before = Get-DisplayStatus
  if ($before.topology -eq 'clone') {
    Set-Topology ([DisplayTopology]::SDC_TOPOLOGY_EXTEND) 'extend'
  }
  Get-DisplayStatus
}

function Invoke-Restore([string]$base64) {
  if (-not $base64) { throw 'restore requires the saved-state JSON (base64) as second argument' }
  $saved = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64)) | ConvertFrom-Json
  if ($saved.topology -eq 'clone' -and (Get-DisplayStatus).topology -ne 'clone') {
    Set-Topology ([DisplayTopology]::SDC_TOPOLOGY_CLONE) 'clone'
  }
  [ordered]@{ ok = $true }
}

try {
  $output = switch ($Command) {
    'status' { Get-DisplayStatus }
    'extend' { Invoke-Extend }
    'restore' { Invoke-Restore $SavedStateBase64 }
  }
  ConvertTo-Json -InputObject $output -Depth 6 -Compress
} catch {
  ConvertTo-Json -InputObject ([ordered]@{ ok = $false; error = "$_" }) -Compress
  exit 1
}
