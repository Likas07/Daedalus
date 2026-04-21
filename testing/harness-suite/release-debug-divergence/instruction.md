The program in `/app` works in debug mode but crashes in release mode.

Please fix it.

Requirements:
- You may modify only `/app/user.cpp`.
- The program must compile and run in both debug and release modes.
- Both builds must print the exact same output: `user:Ada Lovelace`.

Compilation commands:
- Debug:   `g++ -std=c++17 -O0 -g -o /app/debug /app/main.cpp /app/user.cpp`
- Release: `g++ -std=c++17 -O2 -DNDEBUG -o /app/release /app/main.cpp /app/user.cpp`