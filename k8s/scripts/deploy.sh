#!/usr/bin/env sh
set -eu

# Deploy the frontend and backend together to a chosen cluster context.

: "${KUBECONFIG_PATH:=${HOME}/.kube/multi-cloud-config}"
: "${KUBE_CONTEXT:=kubernetes-admin@homework-cluster}"
: "${APP_NAME:=demo-app}"
: "${TARGET_NAMESPACE:=staging}"
: "${FRONTEND_IMAGE:=docker.io/your-dockerhub-namespace/demo-app-frontend:latest}"
: "${BACKEND_IMAGE:=docker.io/your-dockerhub-namespace/demo-app-backend:latest}"
: "${APP_VERSION:=latest}"
: "${CLUSTER_NAME:=local-lab}"
: "${DEPLOY_ENV:=staging}"
: "${FRONTEND_REPLICAS:=2}"
: "${BACKEND_REPLICAS:=2}"
: "${FRONTEND_PORT:=8080}"
: "${BACKEND_PORT:=8080}"
: "${FRONTEND_SERVICE_PORT:=80}"
: "${BACKEND_SERVICE_PORT:=80}"
: "${INGRESS_HOST:=demo-app.apps.local}"
: "${REGISTRY_SECRET_NAME:=regcred}"

export APP_NAME TARGET_NAMESPACE FRONTEND_IMAGE BACKEND_IMAGE APP_VERSION CLUSTER_NAME DEPLOY_ENV
export FRONTEND_REPLICAS BACKEND_REPLICAS FRONTEND_PORT BACKEND_PORT FRONTEND_SERVICE_PORT BACKEND_SERVICE_PORT
export INGRESS_HOST REGISTRY_SECRET_NAME

envsubst < k8s/deployments/frontend-deployment.yml.j2 | kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" apply -f -
envsubst < k8s/deployments/backend-deployment.yml.j2 | kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" apply -f -
envsubst < k8s/deployments/frontend-service.yml.j2 | kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" apply -f -
envsubst < k8s/deployments/backend-service.yml.j2 | kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" apply -f -
envsubst < k8s/deployments/stack-ingress.yml.j2 | kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" apply -f -

kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" rollout status "deployment/${APP_NAME}-frontend" -n "${TARGET_NAMESPACE}" --timeout=180s
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" rollout status "deployment/${APP_NAME}-backend" -n "${TARGET_NAMESPACE}" --timeout=180s