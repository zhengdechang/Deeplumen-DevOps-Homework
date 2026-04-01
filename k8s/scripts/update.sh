#!/usr/bin/env sh
set -eu

# Update both images together so the frontend and backend stay aligned.

: "${KUBECONFIG_PATH:=${HOME}/.kube/multi-cloud-config}"
: "${KUBE_CONTEXT:=kubernetes-admin@homework-cluster}"
: "${APP_NAME:=demo-app}"
: "${TARGET_NAMESPACE:=staging}"
: "${FRONTEND_IMAGE:=docker.io/your-dockerhub-namespace/demo-app-frontend:latest}"
: "${BACKEND_IMAGE:=docker.io/your-dockerhub-namespace/demo-app-backend:latest}"
: "${FRONTEND_REPLICAS:=2}"
: "${BACKEND_REPLICAS:=2}"

kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" set image "deployment/${APP_NAME}-frontend" frontend="${FRONTEND_IMAGE}" -n "${TARGET_NAMESPACE}"
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" set image "deployment/${APP_NAME}-backend" backend="${BACKEND_IMAGE}" -n "${TARGET_NAMESPACE}"
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" scale "deployment/${APP_NAME}-frontend" --replicas="${FRONTEND_REPLICAS}" -n "${TARGET_NAMESPACE}"
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" scale "deployment/${APP_NAME}-backend" --replicas="${BACKEND_REPLICAS}" -n "${TARGET_NAMESPACE}"
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" rollout status "deployment/${APP_NAME}-frontend" -n "${TARGET_NAMESPACE}" --timeout=180s
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" rollout status "deployment/${APP_NAME}-backend" -n "${TARGET_NAMESPACE}" --timeout=180s