# Stage 1: Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend (statically linked with musl for scratch compatibility)
FROM rust:1.93-bookworm AS backend-builder
WORKDIR /app/backend
# musl-tools provides native musl toolchain; uname -m maps x86_64/aarch64 directly to Rust target triples
RUN apt-get update && apt-get install -y --no-install-recommends musl-tools && \
    rm -rf /var/lib/apt/lists/*
RUN RUST_TARGET="$(uname -m)-unknown-linux-musl" && \
    rustup target add "$RUST_TARGET" && \
    echo "$RUST_TARGET" > /tmp/rust_target.txt
COPY backend/Cargo.toml backend/Cargo.lock ./
# Create dummy main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    cargo build --release --target "$(cat /tmp/rust_target.txt)" 2>/dev/null || true
# Now build with real source
COPY backend/src/ src/
RUN touch src/main.rs && \
    cargo build --release --target "$(cat /tmp/rust_target.txt)" && \
    cp "target/$(cat /tmp/rust_target.txt)/release/pi-dash" pi-dash

# Stage 3: Minimal runtime from scratch
FROM scratch
# WORKDIR sets the container's CWD; the binary uses relative paths (./static) at runtime
WORKDIR /app
COPY --from=backend-builder /app/backend/pi-dash /app/pi-dash
COPY --from=frontend-builder /app/frontend/dist /app/static

ENV PI_DASH_PORT=3300
ENV PI_DASH_USER=admin
ENV PI_DASH_PASS=admin

EXPOSE 3300

CMD ["/app/pi-dash"]
