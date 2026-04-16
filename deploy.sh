#!/bin/bash
# deploy.sh — Full production deployment for Lottery Inventory
# Run as root on Ubuntu server: bash deploy.sh
# Server: 104.248.52.151
# Domain: lottery.bright-core-solutions.com

set -e

REPO="https://github.com/ak-2811/Lottery_Inventory.git"
APP_DIR="/var/www/Lottery_Inventory"
DOMAIN="lottery.bright-core-solutions.com"
DJANGO_DIR="$APP_DIR/Backend"
REACT_DIR="$APP_DIR/lottery-sste_main"
VENV="$DJANGO_DIR/venv"
DJANGO_SETTINGS="config.settings_prod"

echo "======================================================"
echo "  Lottery Inventory — Production Deploy"
echo "======================================================"

# ─── 1. System packages ──────────────────────────────────
echo ""
echo "📦 [1/8] Installing system packages..."
apt-get update -qq
apt-get install -y python3 python3-pip python3-venv nginx nodejs npm git certbot python3-certbot-nginx

# ─── 2. Clone / pull repo ────────────────────────────────
echo ""
echo "📥 [2/8] Cloning repository..."
if [ -d "$APP_DIR" ]; then
    echo "  Repo exists, pulling latest..."
    cd "$APP_DIR" && git pull
else
    git clone "$REPO" "$APP_DIR"
fi

# ─── 3. Django backend setup ─────────────────────────────
echo ""
echo "🐍 [3/8] Setting up Django backend..."
cd "$DJANGO_DIR"

# Create virtualenv
python3 -m venv "$VENV"
source "$VENV/bin/activate"

pip install --upgrade pip -q
pip install -r requirements.txt -q

# Copy prod settings if not already there
if [ ! -f "$DJANGO_DIR/config/settings_prod.py" ]; then
    echo "  ⚠️  settings_prod.py not found — please add it to config/ before continuing."
    exit 1
fi

# Run migrations
DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS python manage.py migrate --noinput

# Collect static files
DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS python manage.py collectstatic --noinput

deactivate

# ─── 4. Fix React API URLs ───────────────────────────────
echo ""
echo "⚛️  [4/8] Fixing React API URLs..."
OLD_URL="http://127.0.0.1:8000/api"
NEW_URL="https://$DOMAIN/api"

find "$REACT_DIR/src" -type f \( -name "*.jsx" -o -name "*.js" -o -name "*.ts" -o -name "*.tsx" \) | while read file; do
    if grep -q "$OLD_URL" "$file"; then
        sed -i "s|$OLD_URL|$NEW_URL|g" "$file"
        echo "  ✅ Fixed: $(basename $file)"
    fi
done

# ─── 5. Build React ──────────────────────────────────────
echo ""
echo "🏗️  [5/8] Building React frontend..."
cd "$REACT_DIR"
npm install --silent
npm run build

echo "  ✅ React build output at: $REACT_DIR/dist"

# ─── 6. Gunicorn systemd service ─────────────────────────
echo ""
echo "⚙️  [6/8] Setting up Gunicorn systemd service..."

cat > /etc/systemd/system/lottery.service <<EOF
[Unit]
Description=Lottery Inventory Gunicorn Daemon
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=$DJANGO_DIR
Environment="DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS"
Environment="DJANGO_SECRET_KEY=CHANGE-ME-use-a-long-random-string"
ExecStart=$VENV/bin/gunicorn \
    --workers 3 \
    --bind unix:/run/lottery.sock \
    config.wsgi:application

Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Fix permissions
chown -R www-data:www-data "$APP_DIR"
chmod -R 755 "$APP_DIR"

systemctl daemon-reload
systemctl enable lottery
systemctl restart lottery
echo "  ✅ Gunicorn service running"

# ─── 7. Nginx config ─────────────────────────────────────
echo ""
echo "🌐 [7/8] Configuring Nginx..."

cat > /etc/nginx/sites-available/lottery <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # React frontend (Vite build output)
    root $REACT_DIR/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Django API
    location /api/ {
        proxy_pass http://unix:/run/lottery.sock;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Django admin
    location /admin/ {
        proxy_pass http://unix:/run/lottery.sock;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Django static files
    location /static/ {
        alias $DJANGO_DIR/staticfiles/;
    }

    # Django media files
    location /media/ {
        alias $DJANGO_DIR/media/;
    }
}
EOF

ln -sf /etc/nginx/sites-available/lottery /etc/nginx/sites-enabled/lottery
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "  ✅ Nginx configured"

# ─── 8. SSL with Certbot ─────────────────────────────────
echo ""
echo "🔒 [8/8] Installing SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@bright-core-solutions.com --redirect
echo "  ✅ SSL installed"

# ─── Done ────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  ✅ Deployment complete!"
echo ""
echo "  🌍 App:   https://$DOMAIN"
echo "  🔌 API:   https://$DOMAIN/api/"
echo "  🔧 Admin: https://$DOMAIN/admin/"
echo ""
echo "  Next: create a superuser:"
echo "  cd $DJANGO_DIR && source venv/bin/activate"
echo "  DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS python manage.py createsuperuser"
echo "======================================================"