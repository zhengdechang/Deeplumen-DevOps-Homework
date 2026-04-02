# ansible + kubernetes + jenkins 自动化 CI/CD 平台


---

## 环境要求

Python 3.10+、Ansible 2.9+、kubectl 1.20+、Docker 20.10+、Jenkins 2.289+。

---
## 支持操作系统
Centos 7

---

## 项目说明
- 使用 Ansible 自动化部署 Kubernetes 集群和 Jenkins，并实现 Jenkins 与 Kubernetes 的集成，构建一个完整的 CI/CD 流水线。
- Ansible Playbook 包含以下角色：
  - common：基础环境配置、时区设置、依赖安装等。
  - k8s_master：Kubernetes Master 节点的初始化和配置。
  - k8s_worker：Kubernetes Worker 节点的加入和配置。
  - jenkins：Jenkins 的安装和初始配置。
  - jenkins_k8s：Jenkins 与 Kubernetes 的集成配置。
  - vault：Ansible Vault 密钥管理，存储敏感信息如 Jenkins 管理员密码、Kubernetes API Server 认证信息等。
- jenkins使用helm部署，部署在k8s的jenkins命名空间下，使用持久化存储，并配置了基本的安全设置。
- Jenkins Pipeline 定义在项目根目录下的 jenkins/Jenkinsfile 中，包含代码检出、构建 Docker 镜像、推送镜像到注册表、部署到 Kubernetes 以及健康检查和通知等阶段。
- 支持production和staging两个环境的部署，production支持人工审批。



## 快速开始

---
1. k8s+jenkins 部署说明

```
1. 克隆项目到 Ansible 控制节点。
2. 编辑 `ansible/inventories/hosts.yml`，配置 Kubernetes Master 和 Worker 节点的 IP 地址和 SSH 连接信息。
3. 编辑 `ansible/inventories/group_vars/all.yml`，设置 Kubernetes 版本、网络插件等全局变量。
4. 执行 ansible-vault create /root/project/ansible/inventories/group_vars/vault.yml   --vault-id default@/root/project/ansible/vault-password   --encrypt-vault-id default 创建密钥文件。
5. 执行 ansible-vault edit /root/project/ansible/inventories/group_vars/vault.yml --vault-password-file /root/project/ansible/vault-password  编辑密钥文件，添加 Jenkins 管理员密码等敏感信息。
6. 运行 ansible-playbook -i ansible/inventories/hosts.yml ansible/playbooks/site.yml 执行 Ansible Playbook，完成 Kubernetes 集群和 Jenkins 的部署与集成。
7. 登录 Jenkins Web UI，使用 Ansible Vault 中配置的管理员密码进行初始登录，并按照提示完成 Jenkins 的初始设置。
```

2. Jenkins Pipeline 使用说明

```
1. 在 Jenkins 中创建两个新的 Pipeline 项目，deploy pipeline 默认名字为deploy-pipeline。
2. 在 Pipeline 配置中选择 "Pipeline script from SCM"，并配置 Git 仓库地址和凭据。
3. 设置 Jenkinsfile 路径为项目根目录下的 jenkins/Jenkinsfile, deploy-pipeline的jenkinsfile设置为jenkins/Jenkinsfile.deploy。
4. 保存并运行 Pipeline，观察构建日志，确保每个阶段顺利执行。
5. 构建完成后，检查 Kubernetes 集群中是否成功部署了应用，并验证其运行状态。
```