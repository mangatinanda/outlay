#!/usr/bin/env bash
# Domain-status watcher for the (expired) custom domain.
#
#   scripts/domain-watch.sh lookup <domain>   print the registry's raw whois record
#   scripts/domain-watch.sh classify          read whois text on stdin, print one of
#                                             DROPZONE | AVAILABLE | REGISTERED | UNKNOWN
#   scripts/domain-watch.sh selftest          exercise classify against known records
#
# Used by .github/workflows/domain-watch.yml (daily). Kept as a plain script so
# it can be run and tested locally: `scripts/domain-watch.sh lookup mangatinanda.me`.
set -euo pipefail

REGISTRY_WHOIS="${REGISTRY_WHOIS:-whois.nic.me}"

lookup() {
  local domain="$1"
  # `|| true`: a network failure yields empty output → classify says UNKNOWN.
  whois -h "$REGISTRY_WHOIS" "$domain" 2>/dev/null || true
}

classify() {
  local text lower
  text="$(cat)"
  lower="$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]')"
  if [[ -z "${lower//[[:space:]]/}" ]]; then
    echo UNKNOWN
    return
  fi
  # Identity Digital's post-expiry window (registrar-only Dutch auction).
  if [[ "$lower" == *dropzone* ]]; then
    echo DROPZONE
    return
  fi
  # A real registration record.
  if [[ "$lower" =~ (registrar:|creation\ date:|registry\ domain\ id:|name\ server:) ]]; then
    echo REGISTERED
    return
  fi
  # Registry says nobody holds it.
  if [[ "$lower" =~ (domain\ not\ found|not\ found|no\ match|no\ data\ found|no\ entries\ found|available\ for\ registration) ]]; then
    echo AVAILABLE
    return
  fi
  echo UNKNOWN
}

selftest() {
  local fail=0
  check() {
    local expected="$1" input="$2" got
    got="$(printf '%s' "$input" | classify)"
    if [[ "$got" == "$expected" ]]; then
      echo "ok   $expected"
    else
      echo "FAIL expected $expected, got $got for: ${input:0:60}"
      fail=1
    fi
  }
  check DROPZONE "This domain is currently available for application via the Identity Digital Dropzone service."
  check AVAILABLE "Domain not found."
  check AVAILABLE "No match for \"EXAMPLE.ME\"."
  check REGISTERED $'Domain Name: example.me\nRegistry Domain ID: D1-ME\nRegistrar: Example Registrar\nCreation Date: 2020-01-01T00:00:00Z\nName Server: NS1.EXAMPLE.COM'
  check UNKNOWN ""
  check UNKNOWN $'   \n'
  check UNKNOWN "whois: connect: Connection refused"
  # A registered record must not be mistaken for the Dropzone line just
  # because a nameserver contains the word.
  check DROPZONE $'Registrar: X\nThis domain is currently available for application via the Identity Digital Dropzone service.'
  return $fail
}

case "${1:-}" in
  lookup) lookup "${2:?domain}" ;;
  classify) classify ;;
  selftest) selftest ;;
  *) echo "usage: $0 lookup <domain> | classify | selftest" >&2; exit 2 ;;
esac
