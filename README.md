# 基于 Linux 与多云集群纳管的 DevOps 作业实现

本项目是对原始作业说明的一份扩展实现，重点面向 `Linux` 环境、`Kubernetes` 集群部署、多云集群纳管，以及前后端一体化的持续交付演示。

当前仓库覆盖两种典型模式：

- `模式 A`：在 Linux 节点上通过 `kubeadm` 自建实验 Kubernetes 集群
- `模式 B`：通过 `kubeconfig` / `context` 纳管已有的国内外云上 Kubernetes 集群

同时，仓库内还内置了一套完整的演示应用：

- `frontend`：轻量 Web 控制台前端
- `backend`：Node.js 后端 API 服务

因此它不仅可以展示单服务发布，还可以完整演示前后端整栈 CI/CD 流程。

## 项目目标

- 使用 `Ansible` 自动化完成 Linux 节点初始化、Kubernetes、Jenkins 和集群纳管
- 使用 `Jenkins Pipeline` 完成前后端服务的部署、更新、回滚和删除
- 支持将服务发布到多个被纳管的 Kubernetes 集群，例如 `ACK`、`CCE`、`TKE`、`EKS`、`GKE`、`AKS`
- 通过 `Ansible Vault` 和 Jenkins 凭据体系避免敏感信息进入 Git

## 支持场景

### 1. 本地 Linux 实验集群

使用 `kubeadm` 创建：

- 1 个 Kubernetes control-plane 节点
- N 个 worker 节点
- 运行在 Kubernetes 内部的 Jenkins
- 通过 Jenkins 或脚本发布的前后端演示应用

### 2. 多云已有集群纳管

使用一个合并后的 `kubeconfig` 文件，包含多个集群上下文，例如：

- `ack-shanghai-prod`
- `cce-beijing-staging`
- `tke-shenzhen-prod`
- `eks-us-east-1-prod`
- `gke-europe-west1-staging`
- `aks-eastus-prod`

Jenkins 或 Web 控制台可以根据流水线参数选择正确的目标 context，并将整套应用发布到对应集群。

## 仓库结构

```text
devops-homework/
|-- ansible/
|-- apps/
|-- clusters/
|-- docker/
|-- docs/
|-- jenkins/
`-- k8s/
```

## 演示应用结构

- `apps/frontend`：由 Nginx 承载的静态前端页面
- `apps/backend`：Node.js API 服务
- `docker/frontend.Dockerfile`：前端镜像构建文件
- `docker/backend.Dockerfile`：后端镜像构建文件

## 快速开始

1. 在 Linux 控制节点安装 Ansible 依赖。

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

2. 编辑 inventory 与公共变量。

```bash
vim ansible/inventories/hosts.yml
vim ansible/inventories/group_vars/all.yml
```

3. 复制并加密 Vault 示例文件。

```bash
cp ansible/inventories/group_vars/all.yml.vault.example ansible/inventories/group_vars/all.yml.vault
cp ansible/inventories/group_vars/multicloud.yml.vault.example ansible/inventories/group_vars/multicloud.yml.vault
ansible-vault encrypt ansible/inventories/group_vars/all.yml.vault
ansible-vault encrypt ansible/inventories/group_vars/multicloud.yml.vault
```

4. 如需创建本地实验集群，执行集群初始化。

```bash
ansible-playbook -i ansible/inventories/hosts.yml ansible/playbooks/site.yml \
  --vault-password-file ansible/vault-password-file
```

5. 如需纳管已有多云 Kubernetes 集群，执行纳管 Playbook。

```bash
ansible-playbook ansible/playbooks/04-onboard-multicloud.yml \
  --vault-password-file ansible/vault-password-file
```

6. 在 Jenkins 中运行整栈流水线时，可使用类似如下参数：

```text
ACTION=deploy
APP_NAME=demo-app
TARGET_CLUSTER=eks-us-east-1-prod
TARGET_NAMESPACE=production
IMAGE_TAG=v1.0.0
FRONTEND_REPLICAS=2
BACKEND_REPLICAS=2
```

## 整栈发布流程

1. 构建 frontend 镜像
2. 构建 backend 镜像
3. 将两者推送到镜像仓库
4. 从 `clusters/managed-clusters.yml` 中选择目标集群 context
5. 部署两套 Deployment、两套 Service 和一个 Ingress
6. 校验前后端 rollout 状态
7. 当更新失败时，对前后端同时执行回滚

## 相比原始作业新增的内容

- 增加了 `clusters/managed-clusters.yml` 多云集群注册表
- 增加了已有云上 Kubernetes 集群纳管 Playbook
- 增加了 `TARGET_CLUSTER` 流水线参数，用于按集群上下文发布
- 增加了完整的前后端演示应用
- 增加了适配多集群重复发布的发布清单与脚本
- 增加了 Web 控制台，可通过页面执行集群部署计划、集群纳管、代码源绑定和应用发布

## 关键安全规则

- 不要提交真实的 `kubeconfig`、token 或镜像仓库密码
- 优先使用 namespace 级别的 RBAC，而不是直接授予 `cluster-admin`
- 使用 Vault 管理敏感 Ansible 变量
- 在 Jenkins 中为生产环境加入审批门禁

## 文档

- Architecture: `docs/architecture.md`
- Runbook: `docs/runbook.md`
- Multi-cloud notes: `docs/multicloud.md`

## devops-homework 启动方式

本地预览启动命令：

```powershell
cd ./devops-homework
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-dev.ps1
```

启动后访问：

- Frontend: `http://127.0.0.1:39080`
- Backend API: `http://127.0.0.1:39081/api/workbench`

停止命令：

```powershell
cd ./devops-homework
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-dev.ps1
```
