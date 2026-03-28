#!/bin/sh
# Expand env vars in turnserver.conf template → runtime config
sed \
  -e "s|\${TURN_REALM}|${TURN_REALM}|g" \
  -e "s|\${TURN_SECRET}|${TURN_SECRET}|g" \
  -e "s|\${TURN_PORT}|${TURN_PORT}|g" \
  -e "s|\${TURN_TLS_PORT}|${TURN_TLS_PORT}|g" \
  -e "s|\${TURN_MIN_PORT}|${TURN_MIN_PORT}|g" \
  -e "s|\${TURN_MAX_PORT}|${TURN_MAX_PORT}|g" \
  /etc/coturn/turnserver.conf.tpl > /tmp/turnserver.conf
exec turnserver -c /tmp/turnserver.conf "$@"
