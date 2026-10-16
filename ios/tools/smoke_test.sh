#!/usr/bin/env bash
# Prüft API-Key und Request-Shape ohne Mac und ohne App.
#   ANTHROPIC_API_KEY=sk-ant-... ./smoke_test.sh "Wie weit ist der Mond entfernt?"
set -euo pipefail

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY ist nicht gesetzt}"
FRAGE="${1:-Sag in einem Satz hallo.}"

SYSTEM='Du bist Jarvis, ein Sprachassistent. Deine Antworten werden vorgelesen.
Antworte auf Deutsch, in höchstens drei Sätzen, ohne Markdown, ohne Emojis.
Keine Einleitungen — antworte direkt.'

BODY=$(jq -n --arg model "claude-opus-5-5" \
             --arg system "$SYSTEM" \
             --arg frage "$FRAGE" \
  '{model: $model,
    max_tokens: 600,
    output_config: {effort: "low"},
    fallbacks: "default",
    system: $system,
    messages: [{role: "user", content: $frage}]}')

ANTWORT=$(curl -sS https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: server-side-fallback-2026-07-01" \
  -d "$BODY")

if [ "$(printf '%s' "$ANTWORT" | jq -r '.type // empty')" = "error" ]; then
  printf 'Fehler: %s\n' "$(printf '%s' "$ANTWORT" | jq -r '.error.message')" >&2
  exit 1
fi

printf '%s\n' "$(printf '%s' "$ANTWORT" | jq -r '.content[] | select(.type == "text") | .text')"
printf -- '---\nModell: %s · Stop: %s · Tokens: %s ein / %s aus\n' \
  "$(printf '%s' "$ANTWORT" | jq -r '.model')" \
  "$(printf '%s' "$ANTWORT" | jq -r '.stop_reason')" \
  "$(printf '%s' "$ANTWORT" | jq -r '.usage.input_tokens')" \
  "$(printf '%s' "$ANTWORT" | jq -r '.usage.output_tokens')"
