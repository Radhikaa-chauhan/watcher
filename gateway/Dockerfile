FROM nginx:1.25-alpine
COPY gateway/nginx.conf /etc/nginx/nginx.conf
# Serve dashboard static files at /dashboard
COPY dashboard /usr/share/nginx/html/dashboard
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
