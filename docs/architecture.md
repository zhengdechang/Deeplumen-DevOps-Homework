# Architecture Notes

## Design Layers

1. `Ansible` prepares Linux nodes and manages operational bootstrap tasks.
2. `Kubernetes` provides both a local lab cluster and externally managed multi-cloud clusters.
3. `Jenkins` is the CI/CD control plane that builds images and publishes services.
4. `Kubeconfig contexts` normalize domestic and overseas cluster onboarding.
5. `Frontend + backend workloads` provide a realistic full-stack release target.

## Application Topology

The sample application is intentionally split into two deployable units:

- `frontend`: served by Nginx and exposed on `/`
- `backend`: Node.js API service exposed on `/api`

This demonstrates a very common production topology where:

- the web tier and API tier have separate images
- the web tier and API tier can scale independently
- ingress routing unifies them under one domain

## Why Multi-Cloud Kubeconfig Contexts

Instead of writing a different deployment process for each cloud provider, this design normalizes everything through:

- one merged kubeconfig file
- one cluster registry file
- one Jenkins pipeline
- one set of Kubernetes templates

This works well for:

- Alibaba Cloud ACK
- Huawei Cloud CCE
- Tencent Cloud TKE
- AWS EKS
- Google GKE
- Azure AKS

## Local Cluster Path

- `common` configures the Linux hosts
- `k8s_master` runs `kubeadm init`
- `k8s_worker` joins the nodes
- `jenkins` deploys Jenkins
- `jenkins_k8s` prepares namespace-level RBAC

## Existing Cluster Onboarding Path

- `multicloud_onboard` copies the merged kubeconfig from a secure location
- it validates the declared contexts
- it creates common namespaces
- it creates image-pull secrets for publishing

## Release Flow

1. Jenkins reads `clusters/managed-clusters.yml`
2. Jenkins chooses the target cluster context
3. Jenkins builds and pushes the frontend image
4. Jenkins builds and pushes the backend image
5. Jenkins renders Kubernetes templates with `envsubst`
6. Jenkins applies the frontend Deployment and Service
7. Jenkins applies the backend Deployment and Service
8. Jenkins applies the shared Ingress
9. Jenkins checks rollout status for both Deployments
10. Jenkins rolls back both Deployments if an update fails