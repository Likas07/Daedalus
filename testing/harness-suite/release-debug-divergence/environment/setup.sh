#!/usr/bin/env bash
set -euo pipefail

cat > /app/main.cpp <<'EOF'
#include <iostream>
#include <string>

std::string render_user_label(const std::string& name);

int main() {
    std::cout << render_user_label("Ada Lovelace") << "\n";
    return 0;
}
EOF

cat > /app/user.cpp <<'EOF'
#include <cassert>
#include <string>

std::string render_user_label(const std::string& name) {
    bool validated = false;
    assert((validated = true, true));
    if (!validated) {
        int* crash = nullptr;
        *crash = 7;
    }
    return "user:" + name;
}
EOF
