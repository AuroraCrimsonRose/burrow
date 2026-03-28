#!/usr/bin/env bash
# UFW rules for coturn (IPv4 only)
# Run with: sudo bash scripts/ufw-coturn.sh
set -euo pipefail

# STUN/TURN listening port – TCP (allocation requests, TCP relay)
ufw allow in on eth0 proto tcp from any to any port 3478 comment "coturn STUN/TURN TCP"

# STUN/TURN listening port – UDP (STUN binding, UDP relay)
ufw allow in on eth0 proto udp from any to any port 3478 comment "coturn STUN/TURN UDP"

# TURN TLS – TCP (TURN over TLS / DTLS)
ufw allow in on eth0 proto tcp from any to any port 5349 comment "coturn TURNS TLS TCP"

# TURN DTLS – UDP (DTLS-SRTP, secure relay)
ufw allow in on eth0 proto udp from any to any port 5349 comment "coturn TURNS DTLS UDP"

# Relay port range – UDP only (media relay for TURN allocations)
ufw allow in on eth0 proto udp from any to any port 49152:49252 comment "coturn relay range UDP"

# Reload and show status
ufw reload
echo ""
echo "=== coturn UFW rules applied ==="
ufw status numbered | grep -i coturn
