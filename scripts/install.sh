#!/usr/bin/env bash
set -euxo pipefail

dnf install -y docker git
systemctl enable --now docker

usermod -aG docker ec2-user

ARCH=$(uname -m)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

case "$ARCH" in x86_64) BX_ARCH=amd64 ;; aarch64) BX_ARCH=arm64 ;; esac
BX_VERSION=$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4)
curl -fsSL "https://github.com/docker/buildx/releases/download/${BX_VERSION}/buildx-${BX_VERSION}.linux-${BX_ARCH}" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
