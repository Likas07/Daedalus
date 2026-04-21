#!/bin/sh
set -eu

cat > /app/user.cpp <<'EOF'
#include <string>

std::string render_user_label(const std::string& name) {
    return "user:" + name;
}
EOF
