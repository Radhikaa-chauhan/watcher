FROM nginx:1.25-alpine
RUN apk add --no-cache gettext
COPY gateway/nginx.conf /etc/nginx/nginx.conf.template
# Serve dashboard static files at /dashboard
COPY dashboard /usr/share/nginx/html/dashboard
EXPOSE 8080
CMD ["sh", "-c", "envsubst '$PORT $DETECTION_SERVICE_HOSTPORT $WS_BROADCASTER_HOSTPORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
