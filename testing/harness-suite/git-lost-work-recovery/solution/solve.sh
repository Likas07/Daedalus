#!/bin/sh
set -eu

cd /app/site
git cherry-pick HEAD@{1}
