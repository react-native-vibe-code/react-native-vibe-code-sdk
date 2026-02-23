# Daytona GitHub Sandbox Template
#
# This Dockerfile creates the same environment as the E2B github template,
# but packaged for use with Daytona workspaces.
#
# Usage with Daytona SDK:
#   const workspace = await daytona.create({ image: 'react-native-vibe-code/github-sandbox:latest' })
#
# Build and push to your container registry:
#   docker build -t react-native-vibe-code/github-sandbox:latest .
#   docker push react-native-vibe-code/github-sandbox:latest
#
# Required environment variables at runtime (set via DAYTONA_IMAGE_ENV or workspace envVars):
#   - ANTHROPIC_API_KEY
#   - GITHUB_TOKEN
#   - GITHUB_OWNER

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

WORKDIR /home/user

# Create project directory
RUN mkdir -p /home/user/project

# Increase Node.js memory limit
ENV NODE_OPTIONS="--max_old_space_size=4096"

# Pre-populate bun's global cache with local-expo-app dependencies
# This makes `bun install` at runtime instant by using cached packages
WORKDIR /tmp/cache-warmup
RUN mkdir -p /tmp/cache-warmup && chown user:user /tmp/cache-warmup

# Copy package files to warm up the cache
COPY --chown=user:user local-expo-app/package.json local-expo-app/bun.lock* ./
COPY --chown=user:user local-expo-app/patches ./patches/

# Switch to user and install dependencies to populate bun's global cache
USER user
RUN bun install

# Switch back to root and clean up temp directory (cache is now populated)
USER root
WORKDIR /home/user
RUN rm -rf /tmp/cache-warmup

# Create a script to help with GitHub operations
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
PROJECT_ID=$1\n\
GITHUB_OWNER=${GITHUB_OWNER:-"your-org"}\n\
\n\
if [ -z "$PROJECT_ID" ]; then\n\
    echo "Usage: github-setup.sh <project-id>"\n\
    exit 1\n\
fi\n\
\n\
if [ -z "$GITHUB_TOKEN" ]; then\n\
    echo "Error: GITHUB_TOKEN environment variable is required"\n\
    exit 1\n\
fi\n\
\n\
REPO_NAME="project-${PROJECT_ID}"\n\
\n\
# Configure git\n\
git config --global user.name "Daytona User"\n\
git config --global user.email "user@daytona.dev"\n\
\n\
# Clone or pull the repository\n\
cd /home/user\n\
if [ -d "project/.git" ]; then\n\
    cd project\n\
    git pull origin main || true\n\
else\n\
    git clone https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${REPO_NAME}.git project || {\n\
        mkdir -p project\n\
        cd project\n\
        git init\n\
        git remote add origin https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${REPO_NAME}.git\n\
    }\n\
fi\n\
\n\
echo "GitHub setup complete for project ${PROJECT_ID}"' > /home/user/github-setup.sh

RUN chmod +x /home/user/github-setup.sh

# Create claude-sdk directory in container root with proper permissions
WORKDIR /claude-sdk
RUN chmod 755 /claude-sdk && chown user:user /claude-sdk

# Switch to user for bun operations
USER user

# Initialize bun project for claude-sdk
RUN bun init -y

# Install dependencies for claude-sdk
# Migrated to claude-agent-sdk (formerly claude-code)
RUN bun install @anthropic-ai/claude-agent-sdk tsx execa

# Install dev dependencies for claude-sdk
RUN bun install --dev @types/node@^24.0.3

# Switch back to root for file operations
USER root

# Copy the claude execution script
COPY templates/expo-template/claude-executor.ts index.ts

# Copy the test script
COPY templates/expo-template/claude-test.ts test.ts

# Copy the structure script
COPY templates/expo-template/get-structure.js get-structure.js

# Copy the edit file script
COPY templates/expo-template/edit-file.js edit-file.js

# Copy the EAS login script
COPY templates/expo-template/eas-login.js eas-login.js
RUN chmod +x eas-login.js

# Add start script and test-run script to package.json
RUN node -e "const pkg = require('./package.json'); pkg.scripts = pkg.scripts || {}; pkg.scripts.start = 'tsx index.ts'; pkg.scripts['test-run'] = 'tsx test.ts'; pkg.scripts['get-structure'] = 'node get-structure.js'; pkg.scripts['edit-file'] = 'node edit-file.js'; pkg.scripts['eas-login'] = 'node eas-login.js'; require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));"

# Note: ANTHROPIC_API_KEY should be set at runtime via environment variables
# Do not hardcode API keys in the Docker image for security reasons

# Pre-create generated_code directory with proper permissions
RUN mkdir -p /claude-sdk/generated_code && chmod 755 /claude-sdk/generated_code && chown -R user:user /claude-sdk

# Return to user home directory and switch to user
WORKDIR /home/user
USER user
