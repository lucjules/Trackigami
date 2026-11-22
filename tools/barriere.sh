#!/usr/bin/env bash
# BARRIÈRE du déploiement (.github/workflows/deploiement.yml) : la fonction EN LIGNE doit être exactement le fichier du dépôt (version de physique ET empreinte de build).
# Relance `node tools/check-deployed.mjs` jusqu'à ce qu'il réussisse : une fonction qui vient d'être déployée met quelques secondes à répondre avec sa nouvelle version.
# Code de sortie 0 : franchie. 1 : jamais conforme après tous les essais, OU point non vérifié (check-deployed sort alors en 2 : « rien n'est prouvé » ne passe pas la barrière).
# Réglages : ESSAIS (défaut 8) et PAUSE en secondes (défaut 15), soit deux minutes au plus. Test : tools/test-build-stamp.mjs.
set -u
cd "$(dirname "$0")/.."
ESSAIS="${ESSAIS:-8}"; PAUSE="${PAUSE:-15}"
case "$ESSAIS$PAUSE" in *[!0-9]*|'') echo "::error::ESSAIS et PAUSE doivent être des nombres entiers" >&2; exit 1 ;; esac
i=1
while [ "$i" -le "$ESSAIS" ]; do
  if node tools/check-deployed.mjs; then
    echo "Barrière franchie (essai $i/$ESSAIS) : submit-score en ligne = fichier du dépôt."
    exit 0
  fi
  echo "--- essai $i/$ESSAIS : la production n'est pas (encore) conforme"
  if [ "$i" -lt "$ESSAIS" ]; then echo "    nouvel essai dans ${PAUSE} s"; sleep "$PAUSE"; fi
  i=$((i + 1))
done
echo "::error::Barrière non franchie après $ESSAIS essai(s) : la fonction en ligne n'est pas celle du dépôt. Le site n'est PAS publié (voir docs/DEPLOIEMENT.md, « Si la barrière échoue »)."
exit 1
