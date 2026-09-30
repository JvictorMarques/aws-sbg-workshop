#!/usr/bin/env bash

dnf update -y
dnf install -y docker git

systemctl start docker
systemctl enable docker

usermod -aG docker ec2-user

PLUGIN_DIR=/usr/local/lib/docker/cli-plugins
mkdir -p "$PLUGIN_DIR"

COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" -o "$PLUGIN_DIR/docker-compose"

chmod +x "$PLUGIN_DIR/docker-compose"

case "$(uname -m)" in
  x86_64) BUILDX_ARCH=amd64 ;;
  aarch64) BUILDX_ARCH=arm64 ;;
esac

BUILDX_VERSION=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -SL "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-${BUILDX_ARCH}" -o "$PLUGIN_DIR/docker-buildx"

chmod +x "$PLUGIN_DIR/docker-buildx"

git --version
docker --version
docker compose version
docker buildx version
