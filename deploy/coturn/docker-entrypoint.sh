#!/bin/sh
# Resolve TURN_HOST domain to public IP, detect local private IP
PUBLIC_IP=$(getent hosts "${TURN_HOST}" | awk '{print $1}' | head -1)
LOCAL_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)

if [ -z "$PUBLIC_IP" ]; then
  echo "WARN: Could not resolve TURN_HOST=${TURN_HOST}, falling back to local IP"
  TURN_EXTERNAL_IP="${LOCAL_IP:-0.0.0.0}"
elif [ "$PUBLIC_IP" = "$LOCAL_IP" ] || [ -z "$LOCAL_IP" ]; then
  TURN_EXTERNAL_IP="$PUBLIC_IP"
else
  TURN_EXTERNAL_IP="${PUBLIC_IP}/${LOCAL_IP}"
fi

echo "INFO: external-ip=${TURN_EXTERNAL_IP}"

# Extract just the public IP (before the slash) for allowed-peer-ip rules
TURN_EXTERNAL_IP_PUBLIC=$(echo "$TURN_EXTERNAL_IP" | cut -d'/' -f1)
echo "INFO: public-ip=${TURN_EXTERNAL_IP_PUBLIC}"

# Local/private IP for relay-ip binding
TURN_LOCAL_IP="${LOCAL_IP:-0.0.0.0}"
echo "INFO: relay-ip=${TURN_LOCAL_IP}"

# Expand env vars in turnserver.conf template → runtime config
sed \
  -e "s|\${TURN_REALM}|${TURN_REALM}|g" \
  -e "s|\${TURN_SECRET}|${TURN_SECRET}|g" \
  -e "s|\${TURN_PORT}|${TURN_PORT}|g" \
  -e "s|\${TURN_TLS_PORT}|${TURN_TLS_PORT}|g" \
  -e "s|\${TURN_MIN_PORT}|${TURN_MIN_PORT}|g" \
  -e "s|\${TURN_MAX_PORT}|${TURN_MAX_PORT}|g" \
  -e "s|\${TURN_EXTERNAL_IP}|${TURN_EXTERNAL_IP}|g" \
  -e "s|\${TURN_EXTERNAL_IP_PUBLIC}|${TURN_EXTERNAL_IP_PUBLIC}|g" \
  -e "s|\${TURN_LOCAL_IP}|${TURN_LOCAL_IP}|g" \
  /tmp/turnserver.conf.tpl > /tmp/turnserver.conf
exec turnserver -c /tmp/turnserver.conf "$@"
