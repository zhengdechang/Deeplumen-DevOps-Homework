# Runbook

## 1. Prepare the Linux Control Node

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip sshpass curl gettext-base docker.io kubectl
python3 -m pip install --user "ansible>=2.16,<2.18"
ansible-galaxy collection install -r ansible/requirements.yml
```

## 2. Configure the Lab Inventory

```bash
vim ansible/inventories/hosts.yml
vim ansible/inventories/group_vars/all.yml
```

## 3. Prepare the Vault Files

```bash
cp ansible/inventories/group_vars/all.yml.vault.example ansible/inventories/group_vars/all.yml.vault
cp ansible/inventories/group_vars/multicloud.yml.vault.example ansible/inventories/group_vars/multicloud.yml.vault
ansible-vault encrypt ansible/inventories/group_vars/all.yml.vault
ansible-vault encrypt ansible/inventories/group_vars/multicloud.yml.vault
```

## 4. Bootstrap the Linux Lab Cluster

```bash
ansible-playbook -i ansible/inventories/hosts.yml ansible/playbooks/site.yml \
  --vault-password-file ansible/vault-password-file
```

## 5. Onboard Existing Multi-Cloud Clusters

```bash
ansible-playbook ansible/playbooks/04-onboard-multicloud.yml \
  --vault-password-file ansible/vault-password-file
```

## 6. Verify Cluster Connectivity

```bash
kubectl --kubeconfig ~/.kube/multi-cloud-config config get-contexts
kubectl --kubeconfig ~/.kube/multi-cloud-config --context ack-shanghai-prod get ns
kubectl --kubeconfig ~/.kube/multi-cloud-config --context eks-us-east-1-prod get ns
```

## 7. Build the Demo Images Manually

```bash
docker build -t docker.io/your-dockerhub-namespace/demo-app-frontend:v1.0.0 -f docker/frontend.Dockerfile .
docker build -t docker.io/your-dockerhub-namespace/demo-app-backend:v1.0.0 -f docker/backend.Dockerfile .
```

## 8. Publish the Full Stack Manually

```bash
KUBE_CONTEXT=eks-us-east-1-prod \
CLUSTER_NAME=eks-us-east-1-prod \
DEPLOY_ENV=production \
APP_NAME=demo-app \
TARGET_NAMESPACE=production \
APP_VERSION=v1.0.0 \
FRONTEND_IMAGE=docker.io/your-dockerhub-namespace/demo-app-frontend:v1.0.0 \
BACKEND_IMAGE=docker.io/your-dockerhub-namespace/demo-app-backend:v1.0.0 \
INGRESS_HOST=demo-app.apps.example.com \
sh k8s/scripts/deploy.sh
```

## 9. Update and Delete the Full Stack

```bash
KUBE_CONTEXT=eks-us-east-1-prod \
APP_NAME=demo-app \
TARGET_NAMESPACE=production \
FRONTEND_IMAGE=docker.io/your-dockerhub-namespace/demo-app-frontend:v1.1.0 \
BACKEND_IMAGE=docker.io/your-dockerhub-namespace/demo-app-backend:v1.1.0 \
sh k8s/scripts/update.sh

KUBE_CONTEXT=eks-us-east-1-prod \
APP_NAME=demo-app \
TARGET_NAMESPACE=production \
sh k8s/scripts/delete.sh
```

## 10. Jenkins Credentials You Need

- `registry-creds`: username/password for the image registry
- `multicloud-kubeconfig`: secret file containing all target kubeconfig contexts

## 11. Jenkins Agent Tooling

The Jenkins agent that runs the pipeline should have:

- `docker` for image build and push
- `kubectl` for Kubernetes deployment operations
- `envsubst` from `gettext-base` for manifest rendering

## Troubleshooting

- If `kubeadm init` fails, make sure swap is disabled and `containerd` is healthy.
- If a cloud context cannot be found, check the merged kubeconfig and cluster registry spelling.
- If image pull fails, confirm `regcred` exists in the target namespace.
- If the frontend loads but API calls fail, inspect the Ingress path routing and backend Service.