# Architecture

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Ansible Control Node                  │
│  roles/                                                  │
│  ├── common/          # 基础环境、时区、依赖              │
│  ├── k8s_master/      # K8s Master 节点初始化            │
│  ├── k8s_worker/      # K8s Worker 节点加入              │
│  ├── jenkins/         # Jenkins 安装 & 初始配置           │
│  ├── jenkins_k8s/     # Jenkins ↔ K8s 集成               │
│  └── vault/           # Ansible Vault 密钥管理            │
└──────────────────────┬──────────────────────────────────┘
                       │ ansible-playbook
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                      │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐                    │
│  │  Master Node │   │ Worker Node  │ × N                │
│  │  API Server  │   │  kubelet     │                    │
│  │  etcd        │   │  kube-proxy  │                    │
│  │  scheduler   │   │  containerd  │                    │
│  └──────────────┘   └──────────────┘                    │
│                                                          │
│  Namespaces:                                             │
│  ├── jenkins/        # Jenkins Master Pod               │
│  ├── staging/        # 预发布环境                        │
│  └── production/     # 生产环境                         │
└──────────────────────┬──────────────────────────────────┘
                       │ kubectl / Kubernetes API
                       ▼
┌─────────────────────────────────────────────────────────┐
│                Jenkins Pipeline                          │
│  Jenkinsfile:                                           │
│  Stage 1: Checkout Code                                  │
│  Stage 2: Build Docker Image                             │
│  Stage 3: Push to Registry                               │
│  Stage 4: Deploy to K8s (create/update/delete pod)      │
│  Stage 5: Health Check & Notify                          │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
Deeplumen-DevOps-Homework/
├── ansible/
│   ├── inventories/
│   │   ├── hosts.yml
│   │   └── group_vars/
│   │       ├── all.yml
│   │       └── vault.yml
│   ├── playbooks/
│   │   ├── 01-setup-cluster.yml
│   │   ├── 02-deploy-jenkins.yml
│   │   └── 03-integrate-jenkins-k8s.yml
│   │   └── site.yml                   # 一键执行入口
│   ├── roles/
│   │   ├── common/
│   │   │   ├── defaults/main.yml
│   │   │   ├── handlers/main.yml
│   │   │   ├── tasks/
│   │   │   │   ├── calico.yml
│   │   │   │   └── main.yml
│   │   │   └── templates/containerd.config.toml.j2
│   │   ├── jenkins/
│   │   │   ├── tasks/main.yml
│   │   │   └── templates/jenkins-values.yaml.j2
│   │   ├── jenkins_k8s/
│   │   │   ├── tasks/main.yml
│   │   │   └── templates/
│   │   │       ├── configure-k8s-cloud.groovy.j2
│   │   │       ├── jenkins-rbac.yml.j2
│   │   │       └── jenkins-sa.yml.j2
│   │   ├── k8s_master/
│   │   │   ├── tasks/
│   │   │   │   ├── calico.yml
│   │   │   │   ├── local-path.yml
│   │   │   │   └── main.yml
│   │   │   └── templates/kubeadm-config.yml.j2
│   │   └── k8s_worker/
│   │       └── tasks/main.yml
│   └── vault-password
├── docker/
│   └── dockerfile-golang
├── docs/
├── jenkins/
│   ├── Jenkinsfile
│   ├── Jenkinsfile.deploy
│   └── shared-library/
│       └── vars/
│           ├── deployToK8S.groovy
│           └── k8sRollback.groovy
├── k8s/
│   ├── deployments/
│   │   ├── app-deployment.yml.j2
│   │   ├── app-ingress.yml.j2
│   │   └── app-service.yml.j2
│   ├── namespaces/
│   │   ├── production.yml
│   │   └── staging.yml
│   └── rbac/
│       ├── jenkins-role.yml
│       ├── jenkins-rolebinding.yml
│       └── jenkins-sa.yml
├── .gitignore
└── README.md
```

---
## 组件说明
- **Ansible Control Node**: 负责执行 Ansible Playbook，管理 Kubernetes 集群的部署和配置。包含多个角色（roles）来组织不同的任务，如基础环境设置、Kubernetes Master/Worker 配置、Jenkins 安装和集成等。
- **Kubernetes Cluster**: 由一个 Master 节点和多个 Worker 节点组成。Master 节点负责集群管理和调度，Worker 节点负责
运行应用容器。集群中划分了不同的命名空间（Namespaces）来隔离 Jenkins、预发布和生产环境。
- **Jenkins Pipeline**: 定义在 Jenkinsfile 中，包含多个阶段（Stages）来实现 CI/CD 流程。通过 Jenkins 与 Kubernetes API 的集成，可以动态创建和管理 Kubernetes 资源，实现自动化部署和发布。
---

## 发布流程说明
- **CI/CD 流程**: Jenkins Pipeline 定义了完整的 CI/CD 流程，从代码检出、构建、部署到发布。通过 Jenkins 与 Kubernetes cloud 的集成，可以实现自动化的持续集成和持续部署，提升开发效率和发布质量。

## 安全性
- **Ansible Vault**: 使用 Ansible Vault 加密敏感信息，确保在版本控制系统中不会泄露密码等机密数据。
- **Kubernetes RBAC**: 通过 Kubernetes 的 Role-Based Access Control (RBAC) 机制，限制 Jenkins 在 Kubernetes 集群中的权限，确保安全性和最小权限原则。