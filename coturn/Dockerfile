FROM coturn/coturn:latest
COPY turnserver.conf /etc/coturn/turnserver.conf.tpl
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER root
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER nobody
ENTRYPOINT ["docker-entrypoint.sh"]
