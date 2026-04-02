# Runbook

---
## 1. 准备基础环境
```
1. 在 Ansible 控制节点上安装 Python 3.10+ 和 Ansible 2.9+。
```

## 2. 部署 Kubernetes 集群
```
1. vi `ansible/inventories/hosts.yml`，配置 Kubernetes Master 和 Worker节点的 IP 地址和 SSH 连接信息。
2. vi `ansible/inventories/group_vars/all.yml`，设置 Kubernetes 版本、网络插件等全局变量。
3. 执行 ansible-vault create /root/project/ansible/inventories/group_vars/vault.yml   --vault-id default@/root/project/ansible/vault-password   --encrypt-vault-id default 创建密钥文件。
4. 执行 ansible-vault edit /root/project/ansible/inventories/group_vars/vault.yml --vault-password-file /root/project/ansible/vault-password  编辑密钥文件，添加 Kubernetes API Server 认证信息等敏感信息。
5. 运行 ansible-playbook -i ansible/inventories/hosts.yml ansible/playbooks/01-setup-cluster.yml 执行 Ansible Playbook，完成 Kubernetes 集群的部署。
```


## 3. 部署 Jenkins
```
1. ansible-playbook -i ansible/inventories/hosts.yml ansible/playbooks/02-deploy-jenkins.yml 执行 Ansible Playbook，完成 Jenkins 的部署与初始配置。
2. 登录 Jenkins Web UI，使用 Ansible Vault 中配置的管理员密码进行初始登录，并按照提示完成 Jenkins 的初始设置。
```

## 4. Jenkins ↔ Kubernetes 集成
```
1. ansible-playbook -i ansible/inventories/hosts.yml ansible/playbooks/03-integrate-jenkins-k8s.yml 执行 Ansible Playbook，完成 Jenkins 与 Kubernetes 的集成配置。
2. 在 Jenkins 中创建新的 Pipeline 项目，并配置 Git 仓库地址和凭据。
3. 设置 Jenkinsfile 路径为项目根目录下的 jenkins/Jenkinsfile。