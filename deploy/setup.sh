#!/bin/bash
set -e

# ─── Burrow Production Setup ───
# Run this on your server: sudo bash setup.sh

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
BURROW_HOME="$HOME/burrow"

echo "── Setting up Burrow at $BURROW_HOME ──"

# Copy deploy files to home (skip if already in place)
mkdir -p "$BURROW_HOME"
if [ "$DEPLOY_DIR" != "$BURROW_HOME" ]; then
    cp "$DEPLOY_DIR/docker-compose.yml" "$BURROW_HOME/"
    cp "$DEPLOY_DIR/.env" "$BURROW_HOME/"
    cp -r "$DEPLOY_DIR/coturn" "$BURROW_HOME/"
fi
chmod +x "$BURROW_HOME/coturn/docker-entrypoint.sh"

# Install nginx config — start with HTTP-only for cert acquisition
if [ -d /etc/nginx/sites-available ]; then
    # Temporary HTTP-only config for certbot
    cat > /tmp/burrow-http.conf <<'EOF'
server {
    listen 80;
    server_name app.catxhosting.com;
    location / { return 200 'ok'; }
}
EOF
    sudo cp /tmp/burrow-http.conf /etc/nginx/sites-available/burrow
    sudo ln -sf /etc/nginx/sites-available/burrow /etc/nginx/sites-enabled/burrow
    sudo nginx -t && sudo systemctl reload nginx
    echo "── Temp HTTP nginx config installed ──"
fi

# Get SSL cert (if certbot is available)
if command -v certbot &> /dev/null; then
    echo "── Getting SSL certificate ──"
    sudo certbot certonly --nginx -d app.catxhosting.com --non-interactive --agree-tos -m admin@catxhosting.com || {
        echo "Certbot failed — get your cert manually and update nginx config"
    }
fi

# Now install the full SSL nginx config
if [ -d /etc/nginx/sites-available ]; then
    sudo cp "$DEPLOY_DIR/nginx-burrow.conf" /etc/nginx/sites-available/burrow
    echo "── Full SSL nginx config installed ──"
fi

# Pull images and start
cd "$BURROW_HOME"
echo "── Pulling Docker images ──"
docker compose pull

echo "── Starting services ──"
docker compose up -d

# Wait for MinIO to be healthy
echo "── Waiting for MinIO ──"
sleep 10

# Create the S3 bucket
echo "── Creating S3 bucket ──"
docker run --rm --network=host \
    -e MC_HOST_burrow="http://$(grep MINIO_ROOT_USER .env | cut -d= -f2):$(grep MINIO_ROOT_PASSWORD .env | cut -d= -f2)@127.0.0.1:9000" \
    minio/mc mb --ignore-existing burrow/burrow

# Set bucket policy to allow public reads (for avatars/uploads)
docker run --rm --network=host \
    -e MC_HOST_burrow="http://$(grep MINIO_ROOT_USER .env | cut -d= -f2):$(grep MINIO_ROOT_PASSWORD .env | cut -d= -f2)@127.0.0.1:9000" \
    minio/mc anonymous set download burrow/burrow/avatars

# Reload nginx
if command -v nginx &> /dev/null; then
    sudo nginx -t && sudo systemctl reload nginx
    echo "── Nginx reloaded ──"
fi

echo ""
echo "── Burrow is running! ──"
echo "  Backend:  http://127.0.0.1:4000"
echo "  MinIO:    http://127.0.0.1:9001 (console)"
echo "  Postgres: 127.0.0.1:5432"
echo ""
echo "Next steps:"
echo "  1. Build frontend: cd web && npm run build"
echo "  2. Copy dist/ to $BURROW_HOME/web/ on the server"
echo "  3. Verify: https://burrow.catxhosting.com"
echo ""
echo "Logs: docker compose -f $BURROW_HOME/docker-compose.yml logs -f"
