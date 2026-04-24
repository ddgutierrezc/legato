#!/usr/bin/env sh

# Copy this file to a LOCAL untracked file before use, for example:
#   cp packages/capacitor/legato-publish-env.example.sh packages/capacitor/legato-publish-env.sh
#
# Then fill in the real values and load it with:
#   source packages/capacitor/legato-publish-env.sh
#
# IMPORTANT:
# - Do NOT commit the real file with secrets.
# - Keep the real file local only.

export MAVEN_CENTRAL_USERNAME='REPLACE_ME_MAVEN_USERNAME'
export MAVEN_CENTRAL_PASSWORD='REPLACE_ME_MAVEN_PASSWORD'

# Preferred backend: local GPG keyring via signing.gnupg.*
export SIGNING_GNUPG_KEY_NAME='REPLACE_ME_GPG_KEY_ID'
# Optional when gpg-agent already unlocks the key:
export SIGNING_GNUPG_PASSPHRASE='REPLACE_ME_GPG_PASSPHRASE'
# Optional overrides:
# export SIGNING_GNUPG_EXECUTABLE='/opt/homebrew/bin/gpg'
# export SIGNING_GNUPG_HOME_DIR="$HOME/.gnupg"

# Fallback backend if local GPG flow is unavailable:
# export SIGNING_KEY_FILE='/absolute/path/to/private-key.asc'
# export SIGNING_KEY="$(cat /absolute/path/to/private-key.asc)"
# export SIGNING_PASSWORD='REPLACE_ME_GPG_PASSPHRASE'
