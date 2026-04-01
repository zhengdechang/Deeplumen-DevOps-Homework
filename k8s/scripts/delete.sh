#!/usr/bin/env sh
set -eu

# Delete the entire frontend/backend stack from the selected cluster context.

: "${KUBECONFIG_PATH:=${HOME}/.kube/multi-cloud-config}"
: "${KUBE_CONTEXT:=kubernetes-admin@homework-cluster}"
: "${APP_NAME:=demo-app}"
: "${TARGET_NAMESPACE:=staging}"

kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" delete ingress "${APP_NAME}" -n "${TARGET_NAMESPACE}" --ignore-not-found
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" delete service "${APP_NAME}-frontend" -n "${TARGET_NAMESPACE}" --ignore-not-found
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" delete service "${APP_NAME}-backend" -n "${TARGET_NAMESPACE}" --ignore-not-found
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" delete deployment "${APP_NAME}-frontend" -n "${TARGET_NAMESPACE}" --ignore-not-found
kubectl --kubeconfig "${KUBECONFIG_PATH}" --context "${KUBE_CONTEXT}" delete deployment "${APP_NAME}-backend" -n "${TARGET_NAMESPACE}" --ignore-not-found