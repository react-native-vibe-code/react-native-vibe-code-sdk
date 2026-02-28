# Use imbios/bun-node image which comes with both Node.js and Bun pre-installed
FROM imbios/bun-node:20-slim

# Fix dpkg issues and install system dependencies
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get update && \
    apt-get install -y --no-install-recommends --fix-broken \
    git \
    curl \
    wget \
    unzip \
    zip \
    ca-certificates \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create user if it doesn't exist and set up sudo
RUN if ! id user > /dev/null 2>&1; then \
        useradd -m -s /bin/bash user && \
        echo "user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers; \
    fi

# Install ngrok
RUN wget -q https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz \
    && tar -xzf ngrok-v3-stable-linux-amd64.tgz \
    && mv ngrok /usr/local/bin/ \
    && rm ngrok-v3-stable-linux-amd64.tgz

# Note: Configure ngrok auth token at runtime via environment variable or startup script
# RUN apt-get update && apt-get install -y \
#     git \
#     curl \
    # watchman \
    # && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /home/user

# Install expo/ngrok and pinggy
# RUN bun install --global @expo/ngrok @pinggy/pinggy

# Create app directory and set ownership
RUN mkdir -p /home/user/app && chown -R user:user /home/user/app

# Change to app directory
WORKDIR /home/user/app

# First, copy only package.json and bun.lock to leverage Bun's global cache
COPY --chown=user:user local-expo-app/package.json local-expo-app/bun.lock* ./

# Verify patches directory exists and copy it before bun install
COPY --chown=user:user local-expo-app/patches ./patches/
RUN ls -la patches/ && echo "✅ Patches directory found"

# Switch to user for bun operations
USER user

# Pre-install dependencies to populate Bun's global cache (~/.bun/install/cache)
# This layer will be cached and reused across builds
RUN bun install

# Switch back to root for file operations
USER root

# Now copy the rest of the local expo app template (excluding node_modules)
COPY --chown=user:user local-expo-app/ ./
RUN rm -rf node_modules

# Ensure temp directories are writable for bun
RUN mkdir -p /tmp/bun-cache && chmod 777 /tmp/bun-cache
ENV BUN_INSTALL_CACHE_DIR=/tmp/bun-cache

# Switch to user for bun operations
USER user

# Run bun install again (will be instant due to cache)
RUN bun install

# Verify patch was applied after bun install
RUN grep -q "ngrokurl" node_modules/@expo/cli/build/bin/cli && \
    echo "✅ Patch successfully applied!" || \
    (echo "❌ Patch NOT applied!" && exit 1)

# Switch back to root
USER root


# Expose the default Expo port
EXPOSE 8081

# Create claude-sdk directory in container root with proper permissions
WORKDIR /claude-sdk
RUN chmod 755 /claude-sdk && chown user:user /claude-sdk

# Switch to user for bun operations
USER user

# Initialize bun project for claude-sdk
RUN bun init -y

# Install dependencies for claude-sdk
# Migrated to claude-agent-sdk (formerly claude-code)
RUN bun install @anthropic-ai/claude-agent-sdk execa

# Install EAS CLI globally
# RUN bun install --global eas-cli

# Create and set permissions for Metro cache directory
RUN mkdir -p /tmp/metro-cache
USER root
RUN chmod 777 /tmp/metro-cache
USER user
ENV TMPDIR=/tmp/metro-cache

# Increase Node.js memory limit
ENV NODE_OPTIONS="--max_old_space_size=4096"

# Install expo/ngrok
RUN bun install @expo/ngrok

# Pinggy is now installed in the app directory, not here

# Install dev dependencies for claude-sdk
RUN bun install --dev @types/node@^24.0.3

# Switch back to root for file operations
USER root

# Copy the pre-built standalone executor bundle
COPY templates/shared/executor.mjs executor.mjs

# Copy the structure script
COPY templates/expo-template/get-structure.js get-structure.js

# Copy the edit file script
COPY templates/expo-template/edit-file.js edit-file.js

# Add start script to package.json
RUN node -e "const pkg = require('./package.json'); pkg.scripts = pkg.scripts || {}; pkg.scripts.start = 'node executor.mjs'; pkg.scripts['get-structure'] = 'node get-structure.js'; pkg.scripts['edit-file'] = 'node edit-file.js'; require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));"

# Note: ANTHROPIC_API_KEY should be set at runtime via environment variables
# Do not hardcode API keys in the Docker image for security reasons

# Pre-create generated_code directory with proper permissions
RUN mkdir -p /claude-sdk/generated_code && chmod 755 /claude-sdk/generated_code && chown -R user:user /claude-sdk

# Pre-create .claude settings directory so the SDK doesn't fail on write
RUN mkdir -p /home/user/.claude && chown -R user:user /home/user/.claude

# Return to app directory and switch to user
WORKDIR /home/user/app
USER user
