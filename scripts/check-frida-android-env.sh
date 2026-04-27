#!/usr/bin/env bash
# check-frida-android-env.sh
# Usage: bash check-frida-android-env.sh [target-package-or-process] [device-serial]
#
# Checks host Frida tools, ADB device connectivity, frida-server status,
# and optionally whether a target process is visible via Frida.
#
# Exit codes: 0 = all checks passed, 1 = at least one FAIL

set -uo pipefail

target="${1:-}"
serial="${2:-}"
fail=0

# ── helpers ──────────────────────────────────────────────────────────────────

say()  { printf '%s\n' "${*:-}"; }
ok()   { say "OK   $*"; }
warn() { say "WARN $*"; }
bad()  { say "FAIL $*"; fail=1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Wrapper: run adb targeting the right device (by serial if provided).
adb_cmd() {
  if [ -n "$serial" ]; then
    adb -s "$serial" "$@"
  else
    adb "$@"
  fi
}

# Wrapper: run frida-ps targeting the right device.
frida_ps_cmd() {
  if [ -n "$serial" ]; then
    frida-ps -D "$serial" "$@"
  else
    frida-ps -U "$@"
  fi
}

frida_can_enumerate() {
  local out
  out="$(frida_ps_cmd 2>/dev/null || true)"
  [ -n "$out" ]
}

# ── Host tools ───────────────────────────────────────────────────────────────

say "== Host tools =="

if have adb; then
  ok "adb: $(command -v adb)"
else
  bad "adb not found in PATH. Install Android platform-tools and ensure adb is available."
fi

if have frida; then
  frida_version="$(frida --version 2>/dev/null || true)"
  if [ -n "$frida_version" ]; then
    ok "frida: $(command -v frida) ($frida_version)"
  else
    warn "frida found but 'frida --version' failed."
  fi
else
  bad "frida not found. Install with: python -m pip install -U frida-tools"
fi

if have frida-ps; then
  ok "frida-ps: $(command -v frida-ps)"
else
  bad "frida-ps not found. Install with: python -m pip install -U frida-tools"
fi

# ── Android device ───────────────────────────────────────────────────────────

say
say "== Android device =="

if ! have adb; then
  warn "Skipping device checks (adb not available)."
else
  # Multi-device guard: if no serial given but multiple devices exist, warn the user.
  if [ -z "$serial" ]; then
    device_count="$(adb devices 2>/dev/null | tail -n +2 | grep -c 'device$' || true)"
    if [ "${device_count:-0}" -gt 1 ]; then
      warn "Multiple ADB devices detected. Pass the serial as argument 2 to avoid ambiguity."
      warn "  Example: bash $0 $target \$(adb devices | awk '/\tdevice$/{print \$1; exit}')"
    fi
  fi

  adb_state="$(adb_cmd get-state 2>/dev/null || true)"
  if [ "$adb_state" = "device" ]; then
    ok "adb device state: device"
  else
    bad "No usable adb device. State: '${adb_state:-unknown}'. Run: adb devices"
    warn "Skipping adb-dependent device checks because no usable device is available."
  fi

  # Only run adb shell checks after get-state confirms a usable device. Otherwise
  # adb may try to start a daemon and print noisy host-side errors.
  if [ "$adb_state" = "device" ]; then
    abi="$(adb_cmd shell getprop ro.product.cpu.abilist 2>/dev/null | tr -d '\r' || true)"
    android_release="$(adb_cmd shell getprop ro.build.version.release 2>/dev/null | tr -d '\r' || true)"
    sdk="$(adb_cmd shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r' || true)"

    if [ -n "$abi" ]; then
      ok "device ABI list: $abi"
    else
      warn "Could not read device ABI. Check device authorization."
    fi
    if [ -n "$android_release" ] || [ -n "$sdk" ]; then
      ok "Android version: ${android_release:-unknown} (SDK ${sdk:-unknown})"
    fi

    uid_line="$(adb_cmd shell id 2>/dev/null | tr -d '\r' || true)"
    if [ -n "$uid_line" ]; then
      ok "adb shell id: $uid_line"
    else
      warn "Could not run 'adb shell id'."
    fi

    # Scan /data/local/tmp for frida-server candidates, stripping ANSI color codes.
    tmp_frida_files="$(adb_cmd shell 'ls -1 /data/local/tmp 2>/dev/null' \
      | sed 's/\x1b\[[0-9;]*m//g' \
      | grep -Ei '^frida-server' \
      | tr -d '\r' || true)"

    if [ -n "$tmp_frida_files" ]; then
      ok "frida-server candidate(s) in /data/local/tmp:"
      printf '%s\n' "$tmp_frida_files" | sed 's/^/     /'
    else
      warn "No frida-server file found in /data/local/tmp."
    fi

    # Detect frida-server process.
    # 'ps -A' was added in Android 8 (SDK 26). Fall back to plain 'ps' for older devices.
    # Note: on API >= 29, SELinux may restrict 'ps' output — absence is not conclusive.
    sdk_int="${sdk:-0}"
    if [ "$sdk_int" -ge 26 ] 2>/dev/null; then
      ps_all="$(adb_cmd shell ps -A 2>/dev/null | tr -d '\r' || true)"
    else
      ps_all="$(adb_cmd shell ps 2>/dev/null | tr -d '\r' || true)"
      if [ -z "$ps_all" ]; then
        # Last-resort: try ps -A anyway (some custom ROMs backport it)
        ps_all="$(adb_cmd shell ps -A 2>/dev/null | tr -d '\r' || true)"
      fi
    fi

    server_lines="$(printf '%s\n' "$ps_all" | grep -i 'frida-server' || true)"

    if [ -n "$server_lines" ]; then
      ok "frida-server process on device:"
      printf '%s\n' "$server_lines" | sed 's/^/     /'
    else
      # ps may not show cross-uid processes on older/restricted devices.
      # Do a functional Frida connectivity check before declaring failure.
      if have frida-ps && frida_can_enumerate; then
        warn "frida-server not visible in 'ps' but frida-ps can enumerate processes — treating as OK."
        warn "(SELinux or a userdebug build may hide the server process from 'ps'.)"
      else
        bad "frida-server is not running (not visible in ps, and frida-ps connectivity failed)."
        if [ -n "$tmp_frida_files" ]; then
          first_server="$(printf '%s\n' "$tmp_frida_files" | head -n 1)"
          if [ -n "$serial" ]; then
            warn "Start it with: adb -s $serial shell su -c 'nohup /data/local/tmp/$first_server >/data/local/tmp/frida-server.log 2>&1 &'"
          else
            warn "Start it with: adb shell su -c 'nohup /data/local/tmp/$first_server >/data/local/tmp/frida-server.log 2>&1 &'"
          fi
        else
          warn "Push a frida-server binary matching host Frida version and device ABI to /data/local/tmp, chmod +x it, then start as root."
          warn "Host Frida version: ${frida_version:-unknown}. Device ABI list: ${abi:-unknown}."
        fi
      fi
    fi
  fi
fi

# ── Frida device connectivity ─────────────────────────────────────────────────

say
say "== Frida device connectivity =="

if ! have frida-ps; then
  warn "Skipping Frida connectivity check (frida-ps not available)."
else
  # Capture stdout and stderr separately to avoid false positive target matches on error text.
  ps_stdout="$(frida_ps_cmd 2>/tmp/_frida_check_err$$)"
  ps_status=$?
  ps_stderr="$(cat /tmp/_frida_check_err$$ 2>/dev/null || true)"
  rm -f "/tmp/_frida_check_err$$"

  if [ "$ps_status" -eq 0 ] && [ -n "$ps_stdout" ]; then
    ok "frida-ps can enumerate processes."

    if [ -n "$target" ]; then
      # Match process name exactly (last column) to avoid partial-name or PID false positives.
      if printf '%s\n' "$ps_stdout" | awk '{print $NF}' | grep -Fx "$target" >/dev/null 2>&1; then
        ok "Target process found: $target"
      else
        warn "Target not found in process list: $target"
        warn "If the app is not running, spawn it: frida -U -f $target -l script.js --no-pause"
        warn "Verify the package name with: adb shell pm list packages | grep <keyword>"
      fi
    fi
  elif [ "$ps_status" -eq 0 ]; then
    bad "frida-ps returned success but no process output. Treating this as failed enumeration."
  else
    bad "frida-ps failed (exit $ps_status)."
    if [ -n "$ps_stderr" ]; then
      printf '%s\n' "$ps_stderr" | sed 's/^/     /'
    fi
    say
    warn "Likely fixes:"
    warn "  1. Start frida-server as root on device: adb shell su -c /data/local/tmp/frida-server"
    warn "  2. Verify ABI match: host frida-tools '${frida_version:-?}' vs device ABI '${abi:-?}'"
    warn "  3. For non-rooted devices: use Frida Gadget embedded in the target APK."
    warn "  4. Ensure host frida-tools and device frida-server are the SAME version."
  fi
fi

# ── Result ────────────────────────────────────────────────────────────────────

say
if [ "$fail" -eq 0 ]; then
  say "RESULT OK"
  exit 0
else
  say "RESULT FAIL"
  exit 1
fi
