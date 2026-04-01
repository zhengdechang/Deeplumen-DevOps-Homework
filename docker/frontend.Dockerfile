FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy the static frontend assets into the unprivileged Nginx image.
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/frontend/index.html /usr/share/nginx/html/index.html
COPY apps/frontend/app.js /usr/share/nginx/html/app.js

EXPOSE 8080