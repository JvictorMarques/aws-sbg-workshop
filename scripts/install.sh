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
BX_VERSION=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/docker/buildx/releases/latest | sed 's#.*/tag/##')
curl -fsSL "https://github.com/docker/buildx/releases/download/${BX_VERSION}/buildx-${BX_VERSION}.linux-${BX_ARCH}" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

docker compose version
docker buildx version
