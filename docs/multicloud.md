# Multi-Cloud Notes

## Cloud Compatibility Strategy

This repository avoids provider-specific deployment logic as much as possible.

Instead, it relies on four stable integration points:

- standardized kubeconfig contexts
- namespace-based release targets
- registry pull secrets
- Kubernetes-native manifests

The same release flow publishes a frontend and backend together, so the sample application behaves like a real production stack.

## Domestic Cloud Examples

- `ACK`: use `aliyun cs GET /k8s/{ClusterId}/user_config`
- `CCE`: use `huaweicloud cce cluster config`
- `TKE`: export kubeconfig from Tencent Cloud console or API

## International Cloud Examples

- `EKS`: use `aws eks update-kubeconfig`
- `GKE`: use `gcloud container clusters get-credentials`
- `AKS`: use `az aks get-credentials`

Merge the contexts into one kubeconfig file and point `vault_multicloud_kubeconfig_source` to it.

## Recommended Registry Patterns

- Mainland China clusters can use an internal or region-accelerated registry mirror
- Overseas clusters can use Docker Hub, GHCR, ECR, GAR, or ACR
- If different clusters need different registries, extend `managed-clusters.yml` with per-cluster registry settings

## Recommended Governance

- Use `staging` for auto-deploy
- Require manual approval before `production`
- Separate cluster credentials from build credentials
- Keep production clusters under narrower RBAC than staging clusters
- Keep frontend and backend image tags aligned for each release